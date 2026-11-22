import { randomUUID } from 'node:crypto';

import type { ModuleRef } from '@nestjs/core';
import type { Connection } from 'mongoose';

import {
  CmsContextAccessAdapter,
} from '../../adapters/outbound/access/cms/cms-context-access.adapter.js';
import {
  RoutingPageLookupAdapter,
} from '../../adapters/outbound/capabilities/pages/routing-page-lookup.adapter.js';
import {
  PageSiteLookupAdapter,
} from '../../adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import {
  MongooseAdminUserStore,
} from '../../adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  mediaLibraryModel,
} from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import {
  TemplateVariableMediaAdapter,
} from '../../adapters/outbound/persistence/mongoose/media/template-variable-media.adapter.js';
import {
  MongoosePageRepository,
} from '../../adapters/outbound/persistence/mongoose/pages/page.repository.js';
import {
  type IPageRecord,
  pageSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageArchivalAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-archival.adapter.js';
import {
  MongoosePageContentSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-content-source.adapter.js';
import {
  MongoosePageCreationAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-creation.adapter.js';
import {
  PageLanguageUsageAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-language-usage.adapter.js';
import {
  MongoosePagePublicationAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publication.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import {
  MongoosePageTemplateVariables,
} from '../../adapters/outbound/persistence/mongoose/pages/page-template-variables.adapter.js';
import {
  MongoosePageTreeStore,
} from '../../adapters/outbound/persistence/mongoose/pages/page-tree-store.adapter.js';
import {
  elementSchema,
  type IElementRecord,
} from '../../adapters/outbound/persistence/mongoose/rendering/element.schema.js';
import {
  elementKeySchema,
  type IElementKeyRecord,
  MongooseElementKeys,
} from '../../adapters/outbound/persistence/mongoose/rendering/element-keys.adapter.js';
import {
  MongooseElementStore,
} from '../../adapters/outbound/persistence/mongoose/rendering/element-store.adapter.js';
import {
  createRoutingModels,
} from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseRoutingSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/routing-source.adapter.js';
import {
  MongooseUrlRepository,
} from '../../adapters/outbound/persistence/mongoose/routing/url.repository.js';
import {
  MongooseUrlSearchAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/url-search.adapter.js';
import {
  MongooseVirtualUrlStore,
} from '../../adapters/outbound/persistence/mongoose/routing/virtual-url-store.adapter.js';
import {
  MongooseSiteRepository,
} from '../../adapters/outbound/persistence/mongoose/sites/site.repository.js';
import {
  type ISiteRecord,
  siteSchema,
} from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  PageSiteGuardAdapter,
} from '../../adapters/outbound/persistence/mongoose/sites/site-content-guard.js';
import {
  MongooseSiteUpdateStore,
} from '../../adapters/outbound/persistence/mongoose/sites/site-update-store.adapter.js';
import {
  type ITemplateVariableRecord,
  MongooseTemplateVariables,
  templateVariableSchema,
} from '../../adapters/outbound/persistence/mongoose/template-variables/template-variables.adapter.js';
import {
  CmsPublishedPagesAdapter,
} from '../../adapters/outbound/publication/files/cms-published-pages.adapter.js';
import {
  PageReleaseBuildAdapter,
} from '../../adapters/outbound/publication/files/page-release-build.adapter.js';
import {
  PublicationSourceAdapter,
} from '../../adapters/outbound/publication/files/publication-source.adapter.js';
import {
  PublishedRoutingAdapter,
} from '../../adapters/outbound/publication/files/published-routing.adapter.js';
import {
  RoutingReleaseBuildAdapter,
} from '../../adapters/outbound/publication/files/routing-release-build.adapter.js';
import {
  BasicRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import {
  FileElementBackupAdapter,
} from '../../adapters/outbound/rendering/files/element-backup.adapter.js';
import {
  FileElementFallbackAdapter,
} from '../../adapters/outbound/rendering/files/element-fallback.adapter.js';
import {
  FileFrontendSourceLocationsAdapter,
} from '../../adapters/outbound/rendering/files/frontend-source-locations.adapter.js';
import {
  ManagedRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/managed-rendering-source.adapter.js';
import {
  FileRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/rendering-source.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import {
  RenderingElementUsagesAdapter,
} from '../../adapters/outbound/rendering/modx/element-usages.adapter.js';
import {
  RenderingRegistryAdapter,
} from '../../adapters/outbound/rendering/modx/rendering-registry.adapter.js';
import {
  FrontendBuildAdapter,
} from '../../adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { HookCompilerAdapter } from '../../adapters/outbound/runtime/hooks/hook-script.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import {
  PageLifecycleValuesAdapter,
} from '../../adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import {
  UrlCreationValuesAdapter,
} from '../../adapters/outbound/values/routing/url-creation-values.adapter.js';
import {
  SiteCreationValuesAdapter,
} from '../../adapters/outbound/values/sites/site-creation-values.adapter.js';
import { JsonLdPublicationSourceService } from '../../app/services/json-ld/json-ld-publication-source.service.js';
import type { IRenderRuntime } from '../../app/services/publication/render-data.service.js';
import { RenderingCatalogService } from '../../app/services/rendering/rendering-catalog.service.js';
import {
  TemplateVariableService,
} from '../../app/services/template-variables/template-variable.service.js';
import {
  TemplateVariablePagePublicationService,
} from '../../app/services/template-variables/template-variable-page-publication.service.js';
import {
  TemplateVariableSourceService,
} from '../../app/services/template-variables/template-variable-source.service.js';
import {
  ConfigureSiteAddonUseCase,
} from '../../app/use-cases/addons/configure-site-addon.use-case.js';
import { DisableSiteAddonUseCase } from '../../app/use-cases/addons/disable-site-addon.use-case.js';
import { EnableSiteAddonUseCase } from '../../app/use-cases/addons/enable-site-addon.use-case.js';
import { GetSiteAddonUseCase } from '../../app/use-cases/addons/get-site-addon.use-case.js';
import { ListSiteAddonsUseCase } from '../../app/use-cases/addons/list-site-addons.use-case.js';
import {
  BlockAdminUserUseCase,
} from '../../app/use-cases/admin-users/block-admin-user.use-case.js';
import {
  DeleteAdminUserUseCase,
} from '../../app/use-cases/admin-users/delete-admin-user.use-case.js';
import { GetAdminUserUseCase } from '../../app/use-cases/admin-users/get-admin-user.use-case.js';
import {
  ListAdminUsersUseCase,
} from '../../app/use-cases/admin-users/list-admin-users.use-case.js';
import {
  UpdateAdminUserUseCase,
} from '../../app/use-cases/admin-users/update-admin-user.use-case.js';
import {
  GetPublishedPageUseCase,
  ListPageVersionsUseCase,
} from '../../app/use-cases/cms/get-published-page.use-case.js';
import { ApplyHookHandlerUseCase } from '../../app/use-cases/hooks/apply-hook-handler.use-case.js';
import {
  CreateHookHandlerUseCase,
} from '../../app/use-cases/hooks/create-hook-handler.use-case.js';
import { GetHookHandlerUseCase } from '../../app/use-cases/hooks/get-hook-handler.use-case.js';
import { GetHookHistoryUseCase } from '../../app/use-cases/hooks/get-hook-history.use-case.js';
import { ListHooksUseCase } from '../../app/use-cases/hooks/list-hooks.use-case.js';
import {
  ReorderHookSubscriptionsUseCase,
} from '../../app/use-cases/hooks/reorder-hook-subscriptions.use-case.js';
import {
  RetryHookDeliveryUseCase,
} from '../../app/use-cases/hooks/retry-hook-delivery.use-case.js';
import {
  SaveHookSubscriptionUseCase,
} from '../../app/use-cases/hooks/save-hook-subscription.use-case.js';
import {
  SetHookHandlerEnabledUseCase,
} from '../../app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { SkipHookDeliveryUseCase } from '../../app/use-cases/hooks/skip-hook-delivery.use-case.js';
import {
  UpdateHookHandlerUseCase,
} from '../../app/use-cases/hooks/update-hook-handler.use-case.js';
import { ArchivePageUseCase } from '../../app/use-cases/pages/archive-page.use-case.js';
import {
  ConfigurePageRenderingUseCase,
} from '../../app/use-cases/pages/configure-page-rendering.use-case.js';
import { CreatePageUseCase } from '../../app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../app/use-cases/pages/get-page.use-case.js';
import { GetPageEditorialStatesUseCase } from '../../app/use-cases/pages/get-page-editorial-states.use-case.js';
import { ListPagesUseCase } from '../../app/use-cases/pages/list-pages.use-case.js';
import { MovePageUseCase } from '../../app/use-cases/pages/move-page.use-case.js';
import { PublishPageUseCase } from '../../app/use-cases/pages/publish-page.use-case.js';
import {
  RestorePageVersionUseCase,
} from '../../app/use-cases/pages/restore-page-version.use-case.js';
import { UpdatePageUseCase } from '../../app/use-cases/pages/update-page.use-case.js';
import {
  GetPublicationOptionsUseCase,
} from '../../app/use-cases/publication/get-publication-options.use-case.js';
import { PreviewPageUseCase } from '../../app/use-cases/publication/preview-page.use-case.js';
import {
  PublishCurrentPageUseCase,
} from '../../app/use-cases/publication/publish-current-page.use-case.js';
import {
  PublishPageReleaseUseCase,
} from '../../app/use-cases/publication/publish-page-release.use-case.js';
import {
  PublishRoutingReleaseUseCase,
} from '../../app/use-cases/publication/publish-routing-release.use-case.js';
import {
  PublishSiteReleaseUseCase,
} from '../../app/use-cases/publication/publish-site-release.use-case.js';
import {
  RepublishSnippetPagesUseCase,
} from '../../app/use-cases/publication/republish-snippet-pages.use-case.js';
import {
  AssignInitialPageUrlUseCase,
} from '../../app/use-cases/routing/assign-initial-page-url.use-case.js';
import { ChangePageUrlUseCase } from '../../app/use-cases/routing/change-page-url.use-case.js';
import {
  ChangePublishedPageUrlUseCase,
} from '../../app/use-cases/routing/change-published-page-url.use-case.js';
import { FindUrlByPathUseCase } from '../../app/use-cases/routing/find-url-by-path.use-case.js';
import { GetUrlCatalogUseCase } from '../../app/use-cases/routing/get-url-catalog.use-case.js';
import { GetUrlHistoryUseCase } from '../../app/use-cases/routing/get-url-history.use-case.js';
import {
  MaterializeVirtualUrlUseCase,
} from '../../app/use-cases/routing/materialize-virtual-url.use-case.js';
import { RebindUrlToPageUseCase } from '../../app/use-cases/routing/rebind-url-to-page.use-case.js';
import {
  RedirectPublishedUrlUseCase,
} from '../../app/use-cases/routing/redirect-published-url.use-case.js';
import { RedirectUrlUseCase } from '../../app/use-cases/routing/redirect-url.use-case.js';
import { SearchUrlsUseCase } from '../../app/use-cases/routing/search-urls.use-case.js';
import { ArchiveSiteUseCase } from '../../app/use-cases/sites/archive-site.use-case.js';
import { CreateSiteUseCase } from '../../app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../../app/use-cases/sites/list-sites.use-case.js';
import { ResolveSiteUseCase } from '../../app/use-cases/sites/resolve-site.use-case.js';
import { UpdateSiteUseCase } from '../../app/use-cases/sites/update-site.use-case.js';
import { Page } from '../../domain/pages/page.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import type { ICmsCoreOperations } from '../../ports/inbound/cms/cms-api.port.js';
import type { IAddonAvailabilityPort } from '../../ports/outbound/addons/addon-availability.port.js';
import type { IAddonCatalogPort } from '../../ports/outbound/addons/addon-catalog.port.js';
import type { ISiteAddonStorePort } from '../../ports/outbound/addons/site-addon-store.port.js';
import type { ICmsContext } from '../../ports/outbound/cms/cms-operations.port.js';
import type { IHookConfigurationStore } from '../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IHookDeliveryStorePort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IJsonLdCatalogReader } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { IDataLoader } from '../../ports/outbound/publication/data-loader.port.js';
import type { IPreviewDeliveryPort } from '../../ports/outbound/publication/preview-delivery.port.js';
import type { IPublicArtifactPort } from '../../ports/outbound/publication/public-artifact.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ITemplateCompositionPort } from '../../ports/outbound/publication/template-composition.port.js';
import type { ISiteSetupPort } from '../../ports/outbound/sites/site-setup.port.js';
import type { ISiteAssetDirectory } from '../../ports/outbound/sites/site-storage.port.js';
import { ADDON_AVAILABILITY, ADDON_CATALOG, SITE_ADDON_STORE } from '../addons/addons.tokens.js';
import {
  HOOK_CHANGES,
  HOOK_CONFIGURATION,
  HOOK_DELIVERIES,
  HOOK_EVENTS,
} from '../hooks/hooks.tokens.js';
import { JSON_LD_CATALOG_READER } from '../json-ld/json-ld.tokens.js';
import { jsonLdReleaseProjection } from '../json-ld/json-ld-release.factory.js';
import { SITE_ASSET_DIRECTORY } from '../media/media.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import {
  COMPOSITION, GET_PUBLISHED_ARTIFACT, PUBLICATION_STORE, PUBLISHED_CONTENT, RELEASE_ACTIVATION, RENDER_PUBLISHED_PAGE,
  RENDER_RUNTIME,
  RESOLVE_PUBLISHED_PATH,
} from '../publication/publication.tokens.js';
import { renderingOperations } from '../rendering/rendering-use-cases.providers.js';
import { registeredSnippets } from '../rendering/snippets.js';
import { SITE_SETUP } from '../sites/sites.tokens.js';
import { templateVariableOperations } from '../template-variables/template-variables.providers.js';
import { cmsMediaOperations } from './cms-media.factory.js';

export interface ICmsSettings {
  readonly sourcesRoot: string;
  readonly loaders?: readonly IDataLoader[];
  readonly media?: { readonly root: string; readonly publicBaseUrl: string };
}

export function cmsCoreOperations(settings: ICmsSettings, ref: ModuleRef, context: ICmsContext,
  preview: IPreviewDeliveryPort): ICmsCoreOperations {
  const connection = ref.get<Connection>(MONGO_CONNECTION, { strict: false });
  const events = ref.get<MongooseHookEvents>(HOOK_EVENTS, { strict: false });
  const originalHooks = ref.get<IHookChangesPort>(HOOK_CHANGES, { strict: false });
  const hooks: IHookChangesPort = {
    prepare: (change) => originalHooks.prepare({ ...change, actorId: context.actorId }),
  };
  const now = (): Date => new Date();
  const values = { nextId: randomUUID, nextVersion: randomUUID, now };
  const pageValues = new PageLifecycleValuesAdapter();
  const siteModel = connection.model<ISiteRecord>('Site', siteSchema);
  const pageModel = connection.model<IPageRecord>('Page', pageSchema);
  const versionModel = connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema);
  const sites = new MongooseSiteRepository(siteModel, now, events);
  const pages = new MongoosePageRepository(pageModel, now,
    new MongoosePageCreationAdapter(pageModel,
      (session) => new PageSiteGuardAdapter(connection, session), events), events);
  const access = new CmsContextAccessAdapter(context, async (id) => !!await sites.findById(id));
  const getSite = new GetSiteUseCase(sites, access);
  const getPage = new GetPageUseCase(pages, access);
  const listPages = new ListPagesUseCase(pages, access);
  const siteUpdates = new MongooseSiteUpdateStore(connection,
    (session) => new PageLanguageUsageAdapter(pageModel, session), now, events);
  const setup = ref.get<ISiteSetupPort>(SITE_SETUP, { strict: false });
  const directory = ref.get<ISiteAssetDirectory | null>(SITE_ASSET_DIRECTORY, { strict: false });
  const store = ref.get<IPublicationStorePort & IPublicationArtifactSourcePort>(PUBLICATION_STORE, { strict: false });
  const activation = ref.get<IReleaseActivationPort>(RELEASE_ACTIVATION, { strict: false });
  const publicFiles = ref.get<IPublicArtifactPort>(PUBLISHED_CONTENT, { strict: false });
  const composition = ref.get<ITemplateCompositionPort>(COMPOSITION, { strict: false });
  const runtime = ref.get<IRenderRuntime>(RENDER_RUNTIME, { strict: false });
  const fileSources = new FileRenderingSourceAdapter(settings.sourcesRoot, new BasicRenderingSourceAdapter());
  const elementStore = new MongooseElementStore(
    connection.model<IElementRecord>('RenderingElement', elementSchema), events);
  const catalog = new RenderingCatalogService(elementStore, new FileElementFallbackAdapter(fileSources));
  const sources = new ManagedRenderingSourceAdapter(elementStore, fileSources);
  const registry = new RenderingRegistryAdapter(sources, registeredSnippets(settings.loaders));
  const definitions = new MongooseTemplateVariables(
    connection.model<ITemplateVariableRecord>('TemplateVariables', templateVariableSchema));
  const media = new TemplateVariableMediaAdapter(mediaLibraryModel(connection), settings.media?.publicBaseUrl ?? null);
  const tvs = new TemplateVariableService(definitions, media);
  const publications = new TemplateVariablePagePublicationService(
    new MongoosePagePublicationAdapter(pageModel, versionModel, events), tvs);
  const pageSource = new MongoosePageContentSourceAdapter(pageModel, versionModel);
  const routingModels = createRoutingModels(connection);
  const urls = new MongooseUrlRepository(routingModels, now, randomUUID, events);
  const routing = new MongooseRoutingSourceAdapter(routingModels.urls);
  const pageLookup = new RoutingPageLookupAdapter(getPage);
  const urlValues = new UrlCreationValuesAdapter();
  const behaviorValues = { nextHistoryId: randomUUID, nextVersion: randomUUID, currentInstant: now };
  const source = new JsonLdPublicationSourceService(new TemplateVariableSourceService(
    new PublicationSourceAdapter(sources, pageSource, routing, getSite), tvs, definitions),
  ref.get<IJsonLdCatalogReader>(JSON_LD_CATALOG_READER, { strict: false }),
  new PublishedRoutingAdapter(activation, store, publicFiles));
  const frontend = new FrontendBuildAdapter(settings.media?.publicBaseUrl,
    new FileFrontendSourceLocationsAdapter(settings.sourcesRoot), new MarkdownConversionAdapter());
  const pageBuild = new PageReleaseBuildAdapter(frontend, store, jsonLdReleaseProjection());
  const releaseValues = { nextReleaseId: randomUUID, now };
  const publish = new PublishPageUseCase(pages, access, publications, pageValues, registry, hooks);
  const configure = new ConfigurePageRenderingUseCase(pages, access, registry, hooks);
  const assign = new AssignInitialPageUrlUseCase(urls, pageLookup, urlValues, access, hooks);
  const release = new PublishPageReleaseUseCase(access, publish, source, composition, runtime,
    pageBuild, store, activation, releaseValues, hooks, tvs);
  const routingRelease = new PublishRoutingReleaseUseCase(access, getSite, routing, activation, store,
    new RoutingReleaseBuildAdapter(store, jsonLdReleaseProjection()), releaseValues, hooks);
  const changeUrl = new ChangePageUrlUseCase(urls, pageLookup, urlValues, access, routing, hooks);
  const redirect = new RedirectUrlUseCase(urls, urls, behaviorValues, access, hooks);
  const publishedRouting = new PublishedRoutingAdapter(activation, store, publicFiles);
  const previews = new PreviewPageUseCase(access, source, composition, runtime, frontend, preview, releaseValues);
  const usages = new RenderingElementUsagesAdapter(sources, listPages);
  const republish = new RepublishSnippetPagesUseCase(new RenderingElementUsagesAdapter(sources, {
    execute: async (input) => (await pageSource.readPublished(input.siteId)).map((page) => new Page(page)),
  }), source, composition, runtime, pageBuild, store, activation, releaseValues, hooks);
  const elements = renderingOperations(getSite, catalog, elementStore,
    new FileElementBackupAdapter(settings.sourcesRoot, fileSources),
    values, usages, { execute: (input) => previews.execute({ ...input, actorId: context.actorId }) },
    new MongooseElementKeys(connection.model<IElementKeyRecord>(
      'RenderingElementKeys', elementKeySchema)), hooks, republish);
  const kindOperations = (kind: TemplateSourceKind): ICmsCoreOperations['templates'] => ({
    list: {
      execute: (input: Parameters<typeof elements.list.execute>[0]) =>
        elements.list.execute({ ...input, kind }),
    },
    get: { execute: (input: Parameters<typeof elements.get.execute>[0]) => elements.get.execute({ ...input, kind }) },
    create: {
      execute: (input: Parameters<typeof elements.create.execute>[0]) =>
        elements.create.execute({ ...input, kind }),
    },
    update: {
      execute: (input: Parameters<typeof elements.update.execute>[0]) =>
        elements.update.execute({ ...input, kind }),
    },
    preview: {
      execute: (input: Parameters<typeof elements.preview.execute>[0]) =>
        elements.preview.execute({ ...input, kind }),
    },
  });
  const publishedPages = new CmsPublishedPagesAdapter(publications, activation, store);
  const addonStore = ref.get<ISiteAddonStorePort>(SITE_ADDON_STORE, { strict: false });
  const addonCatalog = ref.get<IAddonCatalogPort>(ADDON_CATALOG, { strict: false });
  const addonAvailability = ref.get<IAddonAvailabilityPort>(ADDON_AVAILABILITY, { strict: false });
  const hookStore = ref.get<IHookConfigurationStore>(HOOK_CONFIGURATION, { strict: false });
  const deliveries = ref.get<IHookDeliveryStorePort>(HOOK_DELIVERIES, { strict: false });
  const hookValues = { id: randomUUID, now };
  const users = new MongooseAdminUserStore(connection, events);

  return {
    sites: {
      create: new CreateSiteUseCase(sites, new SiteCreationValuesAdapter(), access, directory, hooks, setup),
      get: getSite,
      resolve: new ResolveSiteUseCase(sites, { siteId: context.siteId, access }),
      list: new ListSitesUseCase(sites, access, context.siteId),
      update: new UpdateSiteUseCase(sites, siteUpdates, access, directory, hooks),
      archive: new ArchiveSiteUseCase(sites, siteUpdates, access, hooks),
    },
    pages: {
      create: new CreatePageUseCase(pages, new PageSiteLookupAdapter(getSite), pageValues, access, hooks),
      get: getPage,
      getDraft: getPage,
      list: listPages,
      update: new UpdatePageUseCase(pages, access, hooks),
      move: new MovePageUseCase(pages, access, new MongoosePageTreeStore(pageModel, now, undefined, events), hooks),
      archive: new ArchivePageUseCase(pages, new MongoosePageArchivalAdapter(pageModel, now, events), access, hooks),
      configureRendering: configure,
      publish,
      restoreVersion: new RestorePageVersionUseCase(pages, publications, access, pageValues, hooks),
      preview: previews,
      getPublicationOptions: new GetPublicationOptionsUseCase(getSite, getPage, sources, routing, publishedRouting,
        new GetPageEditorialStatesUseCase(access, pages, activation, publishedPages)),
      publishCurrent: new PublishCurrentPageUseCase(getPage, configure, assign, routing, urlValues, release),
      publishRelease: release,
      getPublished: new GetPublishedPageUseCase(access, publishedPages),
      listVersions: new ListPageVersionsUseCase(access, publishedPages),
    },
    urls: {
      assignInitial: assign,
      findByPath: new FindUrlByPathUseCase(urls, access),
      change: changeUrl,
      getHistory: new GetUrlHistoryUseCase(urls, access),
      getCatalog: new GetUrlCatalogUseCase(access, getSite, listPages, routing, urls, publishedRouting),
      search: new SearchUrlsUseCase(access, urls, new MongooseUrlSearchAdapter(routingModels.urls)),
      changePublished: new ChangePublishedPageUrlUseCase(changeUrl, routingRelease, access),
      materialize: new MaterializeVirtualUrlUseCase(new MongooseVirtualUrlStore(
        routingModels, pageModel, events), access, urlValues, routingRelease, hooks),
      rebind: new RebindUrlToPageUseCase(urls, urls, pageLookup, behaviorValues, access, hooks),
      redirect,
      redirectPublished: new RedirectPublishedUrlUseCase(redirect, routingRelease, access),
    },
    publication: {
      publishSite: new PublishSiteReleaseUseCase(access, source, composition, runtime, frontend,
        store, activation, releaseValues, hooks),
      publishRouting: routingRelease,
      resolvePath: ref.get(RESOLVE_PUBLISHED_PATH, { strict: false }),
      renderPage: ref.get(RENDER_PUBLISHED_PAGE, { strict: false }),
      getArtifact: ref.get(GET_PUBLISHED_ARTIFACT, { strict: false }),
      republishSnippetPages: republish,
    },
    templates: kindOperations(TemplateSourceKind.Template),
    chunks: kindOperations(TemplateSourceKind.Chunk),
    snippets: kindOperations(TemplateSourceKind.Snippet),
    tvs: templateVariableOperations(getSite, getPage, catalog, definitions, media,
      new MongoosePageTemplateVariables(connection, pageModel, now, (siteId, version, session) =>
        definitions.guard(siteId, version, session),
      (siteId, version, session) => media.guard(siteId, version, session)), tvs),
    files: cmsMediaOperations(settings.media, connection, access, sources, store),
    addons: {
      list: new ListSiteAddonsUseCase(addonStore, addonCatalog, access),
      get: new GetSiteAddonUseCase(addonStore, addonCatalog, access),
      enable: new EnableSiteAddonUseCase(addonStore, addonCatalog, access, values, addonAvailability, hooks),
      configure: new ConfigureSiteAddonUseCase(addonStore, addonCatalog, access, values, addonAvailability, hooks),
      disable: new DisableSiteAddonUseCase(addonStore, access, values, hooks),
    },
    hooks: {
      list: new ListHooksUseCase(hookStore, access),
      get: new GetHookHandlerUseCase(hookStore, access),
      create: new CreateHookHandlerUseCase(hookStore, access, hookValues),
      update: new UpdateHookHandlerUseCase(hookStore, access, hookValues),
      apply: new ApplyHookHandlerUseCase(hookStore, access, hookValues, new HookCompilerAdapter()),
      setEnabled: new SetHookHandlerEnabledUseCase(hookStore, access, hookValues),
      subscribe: new SaveHookSubscriptionUseCase(hookStore, access, hookValues),
      reorder: new ReorderHookSubscriptionsUseCase(hookStore, access),
      history: new GetHookHistoryUseCase(deliveries, access),
      retry: new RetryHookDeliveryUseCase(deliveries, access),
      skip: new SkipHookDeliveryUseCase(deliveries, access),
    },
    adminUsers: {
      get: new GetAdminUserUseCase(users, access),
      list: {
        execute: async (input) => {
          const list = new ListAdminUsersUseCase(users, access);
          const items = [];
          let cursor: string | null = null;

          do {
            const page = await list.execute({ ...input, cursor, limit: 100 });

            items.push(...page.items);
            cursor = page.nextCursor;
          } while (cursor);

          return { items, nextCursor: null };
        },
      },
      update: new UpdateAdminUserUseCase(users, access, new ScryptAdminPasswordAdapter(), values),
      block: new BlockAdminUserUseCase(users, access, values),
      delete: new DeleteAdminUserUseCase(users, access, values),
    },
  };
}
