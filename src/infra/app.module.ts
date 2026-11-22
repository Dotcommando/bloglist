import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection } from 'mongoose';

import { LocalPageAccessAdapter } from '../adapters/outbound/access/local/pages/local-page-access.adapter.js';
import { LocalRoutingAccessAdapter } from '../adapters/outbound/access/local/routing/local-routing-access.adapter.js';
import { LocalSiteAccessAdapter } from '../adapters/outbound/access/local/sites/local-site-access.adapter.js';
import { RoutingPageLookupAdapter } from '../adapters/outbound/capabilities/pages/routing-page-lookup.adapter.js';
import { PageSiteLookupAdapter } from '../adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import type {
  ICloudflareDeploymentSettings,
} from '../adapters/outbound/deployment/cloudflare/cloudflare-deployment.adapter.js';
import {
  readDeploymentOwner, withDeploymentLock,
} from '../adapters/outbound/deployment/cloudflare/deployment-files.js';
import { runWrangler } from '../adapters/outbound/deployment/cloudflare/wrangler.adapter.js';
import type { MongooseHookEvents } from '../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { MongoosePageRepository } from '../adapters/outbound/persistence/mongoose/pages/page.repository.js';
import { type IPageRecord, pageSchema } from '../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { MongoosePageArchivalAdapter } from '../adapters/outbound/persistence/mongoose/pages/page-archival.adapter.js';
import { MongoosePageCreationAdapter } from '../adapters/outbound/persistence/mongoose/pages/page-creation.adapter.js';
import {
  PageLanguageUsageAdapter,
} from '../adapters/outbound/persistence/mongoose/pages/page-language-usage.adapter.js';
import { MongoosePageTreeStore } from '../adapters/outbound/persistence/mongoose/pages/page-tree-store.adapter.js';
import { createRoutingModels } from '../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { MongooseUrlRepository } from '../adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { MongooseUrlSearchAdapter } from '../adapters/outbound/persistence/mongoose/routing/url-search.adapter.js';
import { MongooseSiteRepository } from '../adapters/outbound/persistence/mongoose/sites/site.repository.js';
import { type ISiteRecord, siteSchema } from '../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import { PageSiteGuardAdapter } from '../adapters/outbound/persistence/mongoose/sites/site-content-guard.js';
import { MongooseSiteUpdateStore } from '../adapters/outbound/persistence/mongoose/sites/site-update-store.adapter.js';
import { PageLifecycleValuesAdapter } from '../adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import { UrlCreationValuesAdapter } from '../adapters/outbound/values/routing/url-creation-values.adapter.js';
import { SiteCreationValuesAdapter } from '../adapters/outbound/values/sites/site-creation-values.adapter.js';
import { ArchivePageUseCase } from '../app/use-cases/pages/archive-page.use-case.js';
import { CreatePageUseCase } from '../app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../app/use-cases/pages/list-pages.use-case.js';
import { MovePageUseCase } from '../app/use-cases/pages/move-page.use-case.js';
import { RestorePageVersionUseCase } from '../app/use-cases/pages/restore-page-version.use-case.js';
import {
  RewritePageMediaReferencesUseCase,
} from '../app/use-cases/pages/rewrite-page-media-references.use-case.js';
import { UpdatePageUseCase } from '../app/use-cases/pages/update-page.use-case.js';
import { AssignInitialPageUrlUseCase } from '../app/use-cases/routing/assign-initial-page-url.use-case.js';
import { ChangePageUrlUseCase } from '../app/use-cases/routing/change-page-url.use-case.js';
import { FindUrlByPathUseCase } from '../app/use-cases/routing/find-url-by-path.use-case.js';
import { GetUrlHistoryUseCase } from '../app/use-cases/routing/get-url-history.use-case.js';
import { RebindUrlToPageUseCase } from '../app/use-cases/routing/rebind-url-to-page.use-case.js';
import { RedirectUrlUseCase } from '../app/use-cases/routing/redirect-url.use-case.js';
import { SearchUrlsUseCase } from '../app/use-cases/routing/search-urls.use-case.js';
import { ArchiveSiteUseCase } from '../app/use-cases/sites/archive-site.use-case.js';
import { CreateSiteUseCase } from '../app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../app/use-cases/sites/list-sites.use-case.js';
import { ResolveSiteUseCase } from '../app/use-cases/sites/resolve-site.use-case.js';
import { UpdateSiteUseCase } from '../app/use-cases/sites/update-site.use-case.js';
import type { IGetPage } from '../ports/inbound/pages/get-page.port.js';
import type { IPrepareSiteDeployment } from '../ports/inbound/publication/prepare-site-deployment.port.js';
import type { IGetSite } from '../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../ports/outbound/pages/page-access.port.js';
import type { IPageArchivalPort } from '../ports/outbound/pages/page-archival.port.js';
import type { IPageLifecycleValues } from '../ports/outbound/pages/page-lifecycle-values.port.js';
import type { IPagePublicationPort } from '../ports/outbound/pages/page-publication.port.js';
import type { IPageTreeStore } from '../ports/outbound/pages/page-tree-store.port.js';
import type { ISiteLookupPort } from '../ports/outbound/pages/site-lookup.port.js';
import type { IPageLookupPort } from '../ports/outbound/routing/page-lookup.port.js';
import type { IRoutingAccessPort } from '../ports/outbound/routing/routing-access.port.js';
import type { IRoutingSourcePort } from '../ports/outbound/routing/routing-source.port.js';
import type { IUrlRepository } from '../ports/outbound/routing/url.repository.js';
import type { IUrlBehaviorStorePort } from '../ports/outbound/routing/url-behavior-store.port.js';
import type {
  IUrlBehaviorAccessPort, IUrlBehaviorValuesPort,
} from '../ports/outbound/routing/url-behavior-values.port.js';
import type { IUrlCreationValues } from '../ports/outbound/routing/url-creation-values.port.js';
import type { IUrlSearchPort } from '../ports/outbound/routing/url-search.port.js';
import type { ISiteRepository } from '../ports/outbound/sites/site.repository.js';
import type { ISiteEditingAccessPort } from '../ports/outbound/sites/site-access.port.js';
import type { ISiteAccessPort } from '../ports/outbound/sites/site-access.port.js';
import type { ISiteCreationValues } from '../ports/outbound/sites/site-creation-values.port.js';
import type { ISiteSetupPort } from '../ports/outbound/sites/site-setup.port.js';
import type { ISiteAssetDirectory } from '../ports/outbound/sites/site-storage.port.js';
import type { ISiteUpdateStorePort } from '../ports/outbound/sites/site-update-store.port.js';
import { INSTALL_ADDON_FROM_REPOSITORY, LIST_ADDON_INSTALLATIONS }
  from './addons/addon-installation.tokens.js';
import { addonProviders } from './addons/addons.providers.js';
import {
  CONFIGURE_SITE_ADDON, DISABLE_SITE_ADDON, ENABLE_SITE_ADDON, GET_SITE_ADDON, LIST_SITE_ADDONS,
} from './addons/addons.tokens.js';
import { adminAuthProviders } from './admin-auth/admin-auth.providers.js';
import { LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER } from './admin-auth/admin-auth.tokens.js';
import { GET_CURRENT_ADMIN_USER } from './admin-auth/admin-auth.tokens.js';
import { LIST_ADMIN_AUTH_SESSIONS } from './admin-auth/admin-auth.tokens.js';
import { REVOKE_ADMIN_AUTH_SESSION } from './admin-auth/admin-auth.tokens.js';
import { adminUserCreationProvider } from './admin-users/admin-user-creation.provider.js';
import { adminUserProviders } from './admin-users/admin-users.providers.js';
import { CREATE_ADMIN_USER_FROM_CONSOLE } from './admin-users/admin-users.tokens.js';
import {
  BLOCK_ADMIN_USER, DELETE_ADMIN_USER,
  GET_ADMIN_USER, LIST_ADMIN_USERS, UPDATE_ADMIN_USER,
} from './admin-users/admin-users.tokens.js';
import { calibrationProviders } from './calibration/calibration.providers.js';
import { cmsApiProviders } from './cms/cms.providers.js';
import { CMS_API } from './cms/cms.tokens.js';
import { cloudflareSettings } from './deployment/cloudflare.settings.js';
import { deploymentProviders } from './deployment/deployment.providers.js';
import { PROCESS_DEPLOYMENT_TARGETS } from './deployment/deployment.tokens.js';
import { GET_DEPLOYMENT_STATUS, PREPARE_SITE_DEPLOYMENT } from './deployment/deployment.tokens.js';
import {
  deploymentExecutorProviders, type IDeploymentExecutorSettings,
} from './deployment/deployment-executor.providers.js';
import { deploymentManagementProviders } from './deployment/deployment-management.providers.js';
import { GET_PAGE_RESOLUTION_STATISTICS, RECORD_PAGE_RESOLUTION } from './diagnostics/diagnostics.tokens.js';
import { pageResolutionLocalProviders } from './diagnostics/page-resolution.providers.js';
import { dumpProviders } from './dumps/dumps.providers.js';
import {
  CAPTURE_SITE_DUMP, CREATE_SITE_DUMP, DELETE_SITE_DUMP, GET_DUMP_EXPORT_ITEMS,
  GET_SITE_DUMP, IMPORT_SITE_DUMP, INSPECT_SITE_DUMP,
  LIST_SITE_DUMPS, RESTORE_SITE_DUMP,
} from './dumps/dumps.tokens.js';
import { hooksProviders } from './hooks/hooks.providers.js';
import { HOOK_EVENTS } from './hooks/hooks.tokens.js';
import { HOOK_OPERATIONS, HOOK_PROCESSOR } from './hooks/hooks.tokens.js';
import { HOOK_CHANGES } from './hooks/hooks.tokens.js';
import { installationProviders } from './installation/installation.providers.js';
import { CHANGE_ADMIN_ADDRESS, GET_INSTALLATION_SETTINGS } from './installation/installation.tokens.js';
import { jsonLdProviders } from './json-ld/json-ld.providers.js';
import {
  BUILD_JSON_LD_PAGE, INSPECT_JSON_LD_DRAFT, INSPECT_JSON_LD_PUBLISHED, LIST_JSON_LD_CATALOG, SAVE_JSON_LD_CATALOG,
} from './json-ld/json-ld.tokens.js';
import { type ILocalApplicationSettings, validateLocalSettings } from './local-application.settings.js';
import { localFileLibraryProviders } from './media/file-library.providers.js';
import { mediaProviders } from './media/media.providers.js';
import { FILE_LIBRARY_OPERATIONS, SITE_FAVICON_OPERATIONS } from './media/media.tokens.js';
import { GET_ASSET, PROCESS_ASSET, UPLOAD_ASSET } from './media/media.tokens.js';
import { SITE_ASSET_DIRECTORY } from './media/media.tokens.js';
import { REWRITE_PAGE_MEDIA_REFERENCES } from './pages/pages.tokens.js';
import { MOVE_PAGE, PAGE_TREE_STORE } from './pages/pages.tokens.js';
import { ARCHIVE_PAGE, PAGE_ARCHIVAL } from './pages/pages.tokens.js';
import {
  CREATE_PAGE, GET_PAGE, LIST_PAGES,
  PAGE_ACCESS, PAGE_REPOSITORY, PAGE_SITE_LOOKUP, PAGE_VALUES, RESTORE_PAGE_VERSION,
  UPDATE_PAGE,
} from './pages/pages.tokens.js';
import { persistenceProviders } from './persistence/persistence.providers.js';
import { MONGO_CONNECTION } from './persistence/persistence.tokens.js';
import { publicationProviders } from './publication/publication.providers.js';
import { PUBLISH_MEDIA_ADDRESS_RELEASE } from './publication/publication.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING,
  GET_PUBLICATION_OPTIONS,
  GET_PUBLISHED_ARTIFACT,
  PAGE_PUBLICATIONS,
  PREVIEW_PAGE,
  PUBLISH_CURRENT_PAGE,
  PUBLISH_PAGE,
  PUBLISH_PAGE_RELEASE,
  PUBLISH_SITE_RELEASE,
  RENDER_PUBLISHED_PAGE,
  RESOLVE_PUBLISHED_PATH,
} from './publication/publication.tokens.js';
import { ROUTING_CONTENT_SOURCE } from './publication/publication.tokens.js';
import { CHANGE_PUBLISHED_PAGE_URL, PUBLISH_ROUTING_RELEASE } from './publication/publication.tokens.js';
import {
  CREATE_RENDERING_ELEMENT, GET_RENDERING_ELEMENT, LIST_RENDERING_ELEMENTS, PREVIEW_RENDERING_ELEMENT,
  UPDATE_RENDERING_ELEMENT,
} from './rendering/rendering.tokens.js';
import { localElementUsagesProvider, renderingAdapterProviders } from './rendering/rendering-adapters.providers.js';
import { renderingUseCaseProviders } from './rendering/rendering-use-cases.providers.js';
import { resourceProviders } from './resources/resources.providers.js';
import { CHANGE_INSTALLATION_RESOURCES, GET_INSTALLATION_RESOURCES } from './resources/resources.tokens.js';
import { MATERIALIZE_VIRTUAL_URL } from './routing/routing.tokens.js';
import { REDIRECT_URL } from './routing/routing.tokens.js';
import { REDIRECT_PUBLISHED_URL } from './routing/routing.tokens.js';
import { REBIND_URL_TO_PAGE, URL_BEHAVIOR_STORE, URL_BEHAVIOR_VALUES } from './routing/routing.tokens.js';
import { GET_URL_CATALOG } from './routing/routing.tokens.js';
import { SEARCH_URLS, URL_SEARCH } from './routing/routing.tokens.js';
import {
  ASSIGN_INITIAL_PAGE_URL, CHANGE_PAGE_URL, FIND_URL_BY_PATH, GET_URL_HISTORY,
  ROUTING_ACCESS, ROUTING_PAGE_LOOKUP, URL_REPOSITORY, URL_VALUES,
} from './routing/routing.tokens.js';
import { virtualUrlProviders } from './routing/virtual-url.providers.js';
import { SITE_SETUP } from './sites/sites.tokens.js';
import { ARCHIVE_SITE } from './sites/sites.tokens.js';
import { SITE_UPDATE_STORE, UPDATE_SITE } from './sites/sites.tokens.js';
import {
  CREATE_SITE, GET_SITE, LIST_SITES,
  RESOLVE_SITE, SITE_ACCESS, SITE_REPOSITORY, SITE_VALUES,
} from './sites/sites.tokens.js';
import {
  localTemplateVariableProvider,
  templateVariableProviders,
} from './template-variables/template-variables.providers.js';
import { TV_OPERATIONS } from './template-variables/template-variables.tokens.js';

@Module({})
export class AppModule {
  static forDeploymentExecutor(input: ILocalApplicationSettings, executor: IDeploymentExecutorSettings): DynamicModule {
    const settings = validateLocalSettings(input);

    if (
      !/^[a-f0-9]{32}$/i.test(executor.accountId)
      || !executor.apiToken.trim()
      || !executor.proxySecret.trim()
      || !path.isAbsolute(executor.outputRoot)
    ) {
      throw new Error('Explicit executor credentials, proxy secret and absolute output root required');
    }

    const providers = deploymentExecutorProviders(settings, executor, async (target) => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(target.targetId)) {
        throw new Error('Invalid target identity');
      }

      const output = cloudflareSettings({
        siteId: target.siteId,
        workerName: target.destinationName,
        publicOrigin: target.publicOrigin,
        backendOrigin: target.backendOrigin,
      }, settings, path.join(executor.outputRoot, target.targetId));
      const context = await NestFactory.createApplicationContext(AppModule.forSiteDeployment(settings, output), {
        logger: false, abortOnError: false,
      });

      try {
        const result = await context.get<IPrepareSiteDeployment>(PREPARE_SITE_DEPLOYMENT)
          .execute({ siteId: target.siteId, actorId: settings.operator.operatorId });

        return { releaseId: result.releaseId, directory: path.dirname(result.directory) };
      } finally {
        await context.close();
      }
    }, async (directory, receipt, target) => withDeploymentLock(directory, async () => {
      const owner = await readDeploymentOwner(directory, target.siteId);

      if (receipt !== receipt.split(':')[0] + ':' + owner.releaseId) {
        throw new Error('Prepared release changed before upload');
      }
      await runWrangler(path.join(directory, 'wrangler.json'), false, undefined, executor.proxySecret, receipt);
    }));

    return {
      module: AppModule,
      providers: [...persistenceProviders(settings), ...providers, ...deploymentManagementProviders(settings)],
      exports: [PROCESS_DEPLOYMENT_TARGETS, GET_DEPLOYMENT_STATUS],
    };
  }

  static forSiteDeployment(input: ILocalApplicationSettings, target: ICloudflareDeploymentSettings): DynamicModule {
    const settings = validateLocalSettings(input);

    return {
      module: AppModule,
      providers: [...persistenceProviders(settings), ...deploymentProviders(settings, target),
        ...deploymentManagementProviders(settings)],
      exports: [PREPARE_SITE_DEPLOYMENT, GET_DEPLOYMENT_STATUS],
    };
  }

  static forAdminUserCreation(input: ILocalApplicationSettings): DynamicModule {
    const settings = validateLocalSettings(input);

    return {
      module: AppModule,
      providers: [...persistenceProviders(settings), ...hooksProviders(settings, true),
        ...adminUserProviders(settings), adminUserCreationProvider()],
      exports: [CREATE_ADMIN_USER_FROM_CONSOLE],
    };
  }

  static forLocalOperator(input: ILocalApplicationSettings): DynamicModule {
    const settings = validateLocalSettings(input);

    return {
      module: AppModule,
      providers: [
        ...cmsApiProviders(settings),
        ...hooksProviders(settings),
        {
          provide: PAGE_TREE_STORE,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents) => new
          MongoosePageTreeStore(connection.model<IPageRecord>('Page', pageSchema), () => new Date(),
            undefined, hookEvents),
        },
        {
          provide: MOVE_PAGE,
          inject: [PAGE_REPOSITORY, PAGE_ACCESS, PAGE_TREE_STORE, HOOK_CHANGES],
          useFactory: (pages: IPageRepository, access: IPageAccessPort, store: IPageTreeStore, hooks:
          IHookChangesPort) =>
            new MovePageUseCase(pages, access, store, hooks),
        },
        ...adminUserProviders(settings),
        ...adminAuthProviders(),
        ...installationProviders(),
        ...resourceProviders(settings),
        ...calibrationProviders(settings),
        ...pageResolutionLocalProviders(),
        ...mediaProviders(settings),
        ...localFileLibraryProviders(settings),
        ...templateVariableProviders(settings.media?.publicBaseUrl ?? null),
        localTemplateVariableProvider,
        ...jsonLdProviders,
        ...dumpProviders(settings),
        ...addonProviders(settings),
        { provide: URL_BEHAVIOR_STORE, useExisting: URL_REPOSITORY },
        {
          provide: REDIRECT_URL,
          inject: [URL_BEHAVIOR_STORE, URL_REPOSITORY, URL_BEHAVIOR_VALUES, ROUTING_ACCESS, HOOK_CHANGES],
          useFactory: (store: IUrlBehaviorStorePort, urls: IUrlRepository, values: IUrlBehaviorValuesPort,
            access: IUrlBehaviorAccessPort, hooks: IHookChangesPort) => new RedirectUrlUseCase(store, urls,
            values, access, hooks),
        },
        {
          provide: URL_BEHAVIOR_VALUES,
          useValue: {
            nextHistoryId: randomUUID,
            nextVersion: randomUUID,
            currentInstant: () => new Date(),
          },
        },
        {
          provide: REBIND_URL_TO_PAGE,
          inject: [URL_BEHAVIOR_STORE, URL_REPOSITORY, ROUTING_PAGE_LOOKUP, URL_BEHAVIOR_VALUES,
            ROUTING_ACCESS, HOOK_CHANGES],
          useFactory: (store: IUrlBehaviorStorePort, urls: IUrlRepository, pages: IPageLookupPort, values:
          IUrlBehaviorValuesPort, access: IUrlBehaviorAccessPort, hooks: IHookChangesPort) =>
            new RebindUrlToPageUseCase(store, urls, pages, values, access, hooks),
        },
        {
          provide: PAGE_ARCHIVAL,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents) =>
            new MongoosePageArchivalAdapter(connection.model<IPageRecord>('Page', pageSchema), () => new
            Date(), hookEvents),
        },
        {
          provide: ARCHIVE_PAGE,
          inject: [PAGE_REPOSITORY, PAGE_ARCHIVAL, PAGE_ACCESS, HOOK_CHANGES],
          useFactory: (pages: IPageRepository, archival: IPageArchivalPort, access: IPageAccessPort, hooks:
          IHookChangesPort) =>
            new ArchivePageUseCase(pages, archival, access, hooks),
        },
        {
          provide: ARCHIVE_SITE,
          inject: [SITE_REPOSITORY, SITE_UPDATE_STORE, SITE_ACCESS, HOOK_CHANGES],
          useFactory: (sites: ISiteRepository, updates: ISiteUpdateStorePort, access: ISiteEditingAccessPort,
            hooks: IHookChangesPort) =>
            new ArchiveSiteUseCase(sites, updates, access, hooks),
        },
        {
          provide: SITE_UPDATE_STORE,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents) => new
          MongooseSiteUpdateStore(connection, (session) => new
          PageLanguageUsageAdapter(connection.model<IPageRecord>('Page', pageSchema), session), () => new
          Date(), hookEvents),
        },
        {
          provide: UPDATE_SITE,
          inject: [SITE_REPOSITORY, SITE_UPDATE_STORE, SITE_ACCESS, SITE_ASSET_DIRECTORY, HOOK_CHANGES],
          useFactory: (sites: ISiteRepository, updates: ISiteUpdateStorePort, access: ISiteEditingAccessPort,
            directory: ISiteAssetDirectory | null, hooks: IHookChangesPort) => new UpdateSiteUseCase(sites,
            updates, access, directory, hooks),
        },
        {
          provide: RESTORE_PAGE_VERSION,
          inject: [PAGE_REPOSITORY, PAGE_PUBLICATIONS, PAGE_ACCESS, PAGE_VALUES, HOOK_CHANGES],
          useFactory: (pages: IPageRepository, publications: IPagePublicationPort, access: IPageAccessPort,
            values: IPageLifecycleValues, hooks: IHookChangesPort) => new RestorePageVersionUseCase(pages,
            publications, access, values, hooks),
        },
        {
          provide: LIST_PAGES,
          inject: [PAGE_REPOSITORY, PAGE_ACCESS],
          useFactory: (pages: IPageRepository, access: IPageAccessPort) => new ListPagesUseCase(pages, access),
        },
        {
          provide: LIST_SITES,
          inject: [SITE_REPOSITORY, SITE_ACCESS],
          useFactory: (sites: ISiteRepository, access: ISiteAccessPort) => new ListSitesUseCase(sites, access),
        },
        ...publicationProviders(settings),
        ...deploymentManagementProviders(settings),
        ...virtualUrlProviders(),
        ...renderingAdapterProviders(settings.rendering?.sourcesRoot ?? path.resolve('sites')),
        localElementUsagesProvider,
        ...renderingUseCaseProviders(settings.operator.operatorId),
        ...persistenceProviders(settings),

        {
          provide: SITE_REPOSITORY,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents): ISiteRepository =>
            new MongooseSiteRepository(connection.model<ISiteRecord>('Site', siteSchema), () => new Date(), hookEvents),
        },
        { provide: SITE_VALUES, useFactory: (): ISiteCreationValues => new SiteCreationValuesAdapter() },
        { provide: SITE_ACCESS, useFactory: (): ISiteAccessPort => new LocalSiteAccessAdapter(settings.operator) },
        {
          provide: CREATE_SITE,
          inject: [SITE_REPOSITORY, SITE_VALUES, SITE_ACCESS, SITE_ASSET_DIRECTORY, HOOK_CHANGES, SITE_SETUP],
          useFactory: (repository: ISiteRepository, values: ISiteCreationValues, access: ISiteAccessPort,
            directory: ISiteAssetDirectory | null, hooks: IHookChangesPort, setup: ISiteSetupPort): CreateSiteUseCase =>
            new CreateSiteUseCase(repository, values, access, directory, hooks, setup),
        },
        {
          provide: GET_SITE,
          inject: [SITE_REPOSITORY, SITE_ACCESS],
          useFactory: (repository: ISiteRepository, access: ISiteAccessPort): GetSiteUseCase =>
            new GetSiteUseCase(repository, access),
        },
        {
          provide: RESOLVE_SITE,
          inject: [SITE_REPOSITORY],
          useFactory: (repository: ISiteRepository): ResolveSiteUseCase => new ResolveSiteUseCase(repository),
        },
        {
          provide: PAGE_REPOSITORY,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents): IPageRepository =>
            new MongoosePageRepository(connection.model<IPageRecord>('Page', pageSchema), () => new Date(),
              new MongoosePageCreationAdapter(connection.model<IPageRecord>('Page', pageSchema),
                (session) => new PageSiteGuardAdapter(connection, session), hookEvents), hookEvents),
        },
        { provide: PAGE_VALUES, useFactory: (): IPageLifecycleValues => new PageLifecycleValuesAdapter() },
        { provide: PAGE_ACCESS, useFactory: (): IPageAccessPort => new LocalPageAccessAdapter(settings.operator) },
        {
          provide: PAGE_SITE_LOOKUP,
          inject: [GET_SITE],
          useFactory: (getSite: IGetSite): ISiteLookupPort => new PageSiteLookupAdapter(getSite),
        },
        {
          provide: CREATE_PAGE,
          inject: [PAGE_REPOSITORY, PAGE_SITE_LOOKUP, PAGE_VALUES, PAGE_ACCESS, HOOK_CHANGES],
          useFactory: (repository: IPageRepository, sites: ISiteLookupPort, values: IPageLifecycleValues,
            access: IPageAccessPort, hooks: IHookChangesPort): CreatePageUseCase =>
            new CreatePageUseCase(repository, sites, values, access, hooks),
        },
        {
          provide: GET_PAGE,
          inject: [PAGE_REPOSITORY, PAGE_ACCESS],
          useFactory: (repository: IPageRepository, access: IPageAccessPort): GetPageUseCase =>
            new GetPageUseCase(repository, access),
        },
        {
          provide: REWRITE_PAGE_MEDIA_REFERENCES,
          inject: [PAGE_REPOSITORY, PAGE_ACCESS, GET_SITE, HOOK_CHANGES],
          useFactory: (repository: IPageRepository, access: IPageAccessPort,
            sites: IGetSite, hooks: IHookChangesPort) =>
            new RewritePageMediaReferencesUseCase(repository, access, sites, hooks),
        },
        {
          provide: UPDATE_PAGE,
          inject: [PAGE_REPOSITORY, PAGE_ACCESS, HOOK_CHANGES],
          useFactory: (repository: IPageRepository, access: IPageAccessPort, hooks: IHookChangesPort):
          UpdatePageUseCase =>
            new UpdatePageUseCase(repository, access, hooks),
        },
        {
          provide: URL_REPOSITORY,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents): IUrlRepository =>
            new MongooseUrlRepository(createRoutingModels(connection), () => new Date(), randomUUID, hookEvents),
        },
        { provide: URL_VALUES, useFactory: (): IUrlCreationValues => new UrlCreationValuesAdapter() },
        {
          provide: ROUTING_ACCESS,
          useFactory: (): IRoutingAccessPort => new LocalRoutingAccessAdapter(settings.operator),
        },
        {
          provide: ROUTING_PAGE_LOOKUP,
          inject: [GET_PAGE],
          useFactory: (getPage: IGetPage): IPageLookupPort => new RoutingPageLookupAdapter(getPage),
        },
        {
          provide: ASSIGN_INITIAL_PAGE_URL,
          inject: [URL_REPOSITORY, ROUTING_PAGE_LOOKUP, URL_VALUES, ROUTING_ACCESS, HOOK_CHANGES],
          useFactory: (urls: IUrlRepository, pages: IPageLookupPort, values: IUrlCreationValues, access:
          IRoutingAccessPort, hooks: IHookChangesPort): AssignInitialPageUrlUseCase =>
            new AssignInitialPageUrlUseCase(urls, pages, values, access, hooks),
        },
        {
          provide: FIND_URL_BY_PATH,
          inject: [URL_REPOSITORY, ROUTING_ACCESS],
          useFactory: (urls: IUrlRepository, access: IRoutingAccessPort): FindUrlByPathUseCase =>
            new FindUrlByPathUseCase(urls, access),
        },
        {
          provide: URL_SEARCH,
          inject: [MONGO_CONNECTION],
          useFactory: (connection: Connection) => new MongooseUrlSearchAdapter(createRoutingModels(connection).urls),
        },
        {
          provide: SEARCH_URLS,
          inject: [ROUTING_ACCESS, URL_REPOSITORY, URL_SEARCH],
          useFactory: (access: IRoutingAccessPort, urls: IUrlRepository, search: IUrlSearchPort) =>
            new SearchUrlsUseCase(access, urls, search),
        },
        {
          provide: CHANGE_PAGE_URL,
          inject: [URL_REPOSITORY, ROUTING_PAGE_LOOKUP, URL_VALUES, ROUTING_ACCESS, ROUTING_CONTENT_SOURCE,
            HOOK_CHANGES],
          useFactory: (urls: IUrlRepository, pages: IPageLookupPort, values: IUrlCreationValues, access:
          IRoutingAccessPort, source: IRoutingSourcePort, hooks: IHookChangesPort): ChangePageUrlUseCase =>
            new ChangePageUrlUseCase(urls, pages, values, access, source, hooks),
        },
        {
          provide: GET_URL_HISTORY,
          inject: [URL_REPOSITORY, ROUTING_ACCESS],
          useFactory: (urls: IUrlRepository, access: IRoutingAccessPort): GetUrlHistoryUseCase =>
            new GetUrlHistoryUseCase(urls, access),
        },
      ],
      exports: [...(settings.dumpCapacity ? [CAPTURE_SITE_DUMP] : []),
        ...(settings.installationResources ? [GET_INSTALLATION_RESOURCES, CHANGE_INSTALLATION_RESOURCES] : []),
        RECORD_PAGE_RESOLUTION, GET_PAGE_RESOLUTION_STATISTICS, GET_INSTALLATION_SETTINGS, CHANGE_ADMIN_ADDRESS,
        CMS_API, TV_OPERATIONS, INSPECT_JSON_LD_DRAFT, INSPECT_JSON_LD_PUBLISHED,
        BUILD_JSON_LD_PAGE, LIST_JSON_LD_CATALOG, SAVE_JSON_LD_CATALOG,
        HOOK_OPERATIONS, HOOK_PROCESSOR,
        INSTALL_ADDON_FROM_REPOSITORY, LIST_ADDON_INSTALLATIONS,
        LIST_SITE_ADDONS, GET_SITE_ADDON, ENABLE_SITE_ADDON,
        CONFIGURE_SITE_ADDON, DISABLE_SITE_ADDON,
        CREATE_SITE_DUMP, DELETE_SITE_DUMP, GET_SITE_DUMP, IMPORT_SITE_DUMP, LIST_SITE_DUMPS, RESTORE_SITE_DUMP,
        GET_DUMP_EXPORT_ITEMS, INSPECT_SITE_DUMP,
        REVOKE_ADMIN_AUTH_SESSION, LIST_ADMIN_AUTH_SESSIONS, GET_CURRENT_ADMIN_USER,
        MATERIALIZE_VIRTUAL_URL,
        LIST_RENDERING_ELEMENTS, GET_RENDERING_ELEMENT, CREATE_RENDERING_ELEMENT, UPDATE_RENDERING_ELEMENT,
        PREVIEW_RENDERING_ELEMENT,
        UPDATE_SITE,
        ARCHIVE_SITE,
        ARCHIVE_PAGE,
        REBIND_URL_TO_PAGE,
        REDIRECT_URL,
        REDIRECT_PUBLISHED_URL,
        LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER,
        GET_ADMIN_USER, UPDATE_ADMIN_USER, BLOCK_ADMIN_USER, DELETE_ADMIN_USER, LIST_ADMIN_USERS,
        ...(settings.media ? [UPLOAD_ASSET, PROCESS_ASSET, GET_ASSET,
          FILE_LIBRARY_OPERATIONS, SITE_FAVICON_OPERATIONS] : []),
        REWRITE_PAGE_MEDIA_REFERENCES, CONFIGURE_PAGE_RENDERING, PREVIEW_PAGE, PUBLISH_PAGE,
        PUBLISH_SITE_RELEASE, PUBLISH_PAGE_RELEASE,
        PUBLISH_MEDIA_ADDRESS_RELEASE, PUBLISH_CURRENT_PAGE, GET_PUBLICATION_OPTIONS, RESOLVE_PUBLISHED_PATH,
        RENDER_PUBLISHED_PAGE,
        GET_PUBLISHED_ARTIFACT,
        LIST_SITES,
        LIST_PAGES,
        RESTORE_PAGE_VERSION,
        CREATE_SITE, GET_SITE, RESOLVE_SITE, CREATE_PAGE, GET_PAGE, UPDATE_PAGE, MOVE_PAGE,
        ASSIGN_INITIAL_PAGE_URL, FIND_URL_BY_PATH, CHANGE_PAGE_URL, GET_URL_HISTORY, GET_URL_CATALOG, SEARCH_URLS,
        PUBLISH_ROUTING_RELEASE, CHANGE_PUBLISHED_PAGE_URL],
    };
  }
}
