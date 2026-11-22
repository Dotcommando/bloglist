import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { AdminContentController } from '../../adapters/inbound/rest/content/admin-content.controller.js';
import type {
  IAdminContentOperationFactory, IAdminContentOperations,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { PageSiteLookupAdapter } from '../../adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { MongoosePageRepository } from '../../adapters/outbound/persistence/mongoose/pages/page.repository.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageCreationAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-creation.adapter.js';
import { MongoosePageTreeStore } from '../../adapters/outbound/persistence/mongoose/pages/page-tree-store.adapter.js';
import {
  MongooseAutomaticPageUrl,
} from '../../adapters/outbound/persistence/mongoose/routing/automatic-page-url.adapter.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { PageSiteGuardAdapter } from '../../adapters/outbound/persistence/mongoose/sites/site-content-guard.js';
import { PageLifecycleValuesAdapter } from '../../adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import { UrlCreationValuesAdapter } from '../../adapters/outbound/values/routing/url-creation-values.adapter.js';
import { SiteCreationValuesAdapter } from '../../adapters/outbound/values/sites/site-creation-values.adapter.js';
import { CreatePageUseCase } from '../../app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../../app/use-cases/pages/list-pages.use-case.js';
import { MovePageUseCase } from '../../app/use-cases/pages/move-page.use-case.js';
import {
  RewritePageMediaReferencesUseCase,
} from '../../app/use-cases/pages/rewrite-page-media-references.use-case.js';
import { UpdatePageUseCase } from '../../app/use-cases/pages/update-page.use-case.js';
import { CreateSiteUseCase } from '../../app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../../app/use-cases/sites/list-sites.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../ports/outbound/pages/page.repository.js';
import type { IPageTreeStore } from '../../ports/outbound/pages/page-tree-store.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import type { ISiteSetupPort } from '../../ports/outbound/sites/site-setup.port.js';
import type { ISiteAssetDirectory } from '../../ports/outbound/sites/site-storage.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { SITE_ASSET_DIRECTORY } from '../media/media.tokens.js';
import { PAGE_TREE_STORE } from '../pages/pages.tokens.js';
import { PAGE_REPOSITORY } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { SITE_SETUP } from '../sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from './content.tokens.js';

const AUTOMATIC_PAGE_URLS = Symbol('AutomaticPageUrls');

export function contentHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [
    {
      provide: AUTOMATIC_PAGE_URLS,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseAutomaticPageUrl(createRoutingModels(connection),
        new UrlCreationValuesAdapter()),
    },
    {
      provide: PAGE_TREE_STORE,
      inject: [MONGO_CONNECTION, HOOK_EVENTS],
      useFactory: (connection: Connection, hookEvents: MongooseHookEvents) => new
      MongoosePageTreeStore(connection.model<IPageRecord>('Page', pageSchema), () => new Date(), undefined,
        hookEvents),
    },
    {
      provide: PAGE_REPOSITORY,
      inject: [MONGO_CONNECTION, HOOK_EVENTS, AUTOMATIC_PAGE_URLS],
      useFactory: (connection: Connection, hookEvents: MongooseHookEvents,
        automaticUrls: MongooseAutomaticPageUrl): IPageRepository => {
        const model = connection.model<IPageRecord>('Page', pageSchema);

        return new MongoosePageRepository(model, () => new Date(), new MongoosePageCreationAdapter(model,
          (session) => new PageSiteGuardAdapter(connection, session), hookEvents, automaticUrls), hookEvents);
      },
    },
    {
      provide: ADMIN_CONTENT_OPERATIONS,
      inject: [SITE_REPOSITORY, PAGE_REPOSITORY, GET_CURRENT_ADMIN_USER, PAGE_TREE_STORE,
        SITE_ASSET_DIRECTORY, HOOK_CHANGES, SITE_SETUP, AUTOMATIC_PAGE_URLS],
      useFactory: (sites: ISiteRepository, pages: IPageRepository, current: IGetCurrentAdminUser, tree:
      IPageTreeStore, directory: ISiteAssetDirectory | null, hooks: IHookChangesPort, setup:
      ISiteSetupPort, automaticUrls: MongooseAutomaticPageUrl): IAdminContentOperationFactory => {
        const siteValues = new SiteCreationValuesAdapter();
        const pageValues = new PageLifecycleValuesAdapter();

        return {
          forSession(token): IAdminContentOperations {
            const sessionHooks: IHookChangesPort = {
              prepare: async (change) => hooks.prepare({
                ...change,
                actorId: (await current.execute({ token })).user.adminUserId,
              }),
            };
            const access = new SessionContentAccessAdapter(current, token);
            const getSite = new GetSiteUseCase(sites, access);

            return {
              createSite: new CreateSiteUseCase(sites, siteValues, access, directory, sessionHooks, setup),
              getSite,
              listSites: new ListSitesUseCase(sites, access),
              createPage: new CreatePageUseCase(pages, new PageSiteLookupAdapter(getSite), pageValues, access,
                sessionHooks, automaticUrls),
              getPage: new GetPageUseCase(pages, access),
              listPages: new ListPagesUseCase(pages, access),
              rewritePageMedia: new RewritePageMediaReferencesUseCase(pages, access, getSite, sessionHooks),
              updatePage: new UpdatePageUseCase(pages, access, sessionHooks),
              movePage: new MovePageUseCase(pages, access, tree, sessionHooks),
            };
          },
        };
      },
    },
    {
      provide: AdminContentController,
      inject: [ADMIN_CONTENT_OPERATIONS],
      useFactory: (operations: IAdminContentOperationFactory) => new AdminContentController(auth, operations),
    },
  ];
}
