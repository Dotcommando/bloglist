import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import { AdminRoutingController } from '../../adapters/inbound/rest/routing/admin-routing.controller.js';
import type {
  IAdminRoutingOperationFactory, IAdminRoutingOperations,
} from '../../adapters/inbound/rest/routing/admin-routing-operations.factory.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { RoutingPageLookupAdapter } from '../../adapters/outbound/capabilities/pages/routing-page-lookup.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  PageLanguageUsageAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-language-usage.adapter.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseRoutingSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/routing-source.adapter.js';
import { MongooseUrlRepository } from '../../adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { MongooseUrlSearchAdapter } from '../../adapters/outbound/persistence/mongoose/routing/url-search.adapter.js';
import {
  MongooseVirtualUrlStore,
} from '../../adapters/outbound/persistence/mongoose/routing/virtual-url-store.adapter.js';
import {
  MongooseSiteUpdateStore,
} from '../../adapters/outbound/persistence/mongoose/sites/site-update-store.adapter.js';
import { PublishedRoutingAdapter } from '../../adapters/outbound/publication/files/published-routing.adapter.js';
import { RoutingReleaseBuildAdapter } from '../../adapters/outbound/publication/files/routing-release-build.adapter.js';
import { UrlCreationValuesAdapter } from '../../adapters/outbound/values/routing/url-creation-values.adapter.js';
import { PublishRoutingReleaseUseCase } from '../../app/use-cases/publication/publish-routing-release.use-case.js';
import { ChangePageUrlUseCase } from '../../app/use-cases/routing/change-page-url.use-case.js';
import { ChangePublishedPageUrlUseCase } from '../../app/use-cases/routing/change-published-page-url.use-case.js';
import { GetUrlCatalogUseCase } from '../../app/use-cases/routing/get-url-catalog.use-case.js';
import { GetUrlHistoryUseCase } from '../../app/use-cases/routing/get-url-history.use-case.js';
import { MaterializeVirtualUrlUseCase } from '../../app/use-cases/routing/materialize-virtual-url.use-case.js';
import { RedirectPublishedUrlUseCase } from '../../app/use-cases/routing/redirect-published-url.use-case.js';
import { RedirectUrlUseCase } from '../../app/use-cases/routing/redirect-url.use-case.js';
import { SearchUrlsUseCase } from '../../app/use-cases/routing/search-urls.use-case.js';
import { UpdateSiteUseCase } from '../../app/use-cases/sites/update-site.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IPublicArtifactPort } from '../../ports/outbound/publication/public-artifact.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { jsonLdReleaseProjection } from '../json-ld/json-ld-release.factory.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { PUBLICATION_STORE, PUBLISHED_CONTENT, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { ADMIN_ROUTING_OPERATIONS } from './routing.tokens.js';

export function routingHttpProviders(settings: IPublicHttpSettings): Provider[] {
  const auth = settings.adminAuth;

  if (!auth) {
    return [];
  }

  return [{
    provide: ADMIN_ROUTING_OPERATIONS,
    inject: [MONGO_CONNECTION, ADMIN_CONTENT_OPERATIONS, GET_CURRENT_ADMIN_USER, SITE_REPOSITORY,
      RELEASE_ACTIVATION, PUBLICATION_STORE, PUBLISHED_CONTENT, HOOK_CHANGES, HOOK_EVENTS],
    useFactory: (connection: Connection, content: IAdminContentOperationFactory, current:
    IGetCurrentAdminUser, sites: ISiteRepository, activation: IReleaseActivationPort, store: IPublicationStorePort
        & IPublicationArtifactSourcePort, files: IPublicArtifactPort, hooks: IHookChangesPort, hookEvents:
    MongooseHookEvents): IAdminRoutingOperationFactory => {
      const models = createRoutingModels(connection);
      const urls = new MongooseUrlRepository(models, () => new Date(), randomUUID, hookEvents);
      const source = new MongooseRoutingSourceAdapter(models.urls);
      const published = new PublishedRoutingAdapter(activation, store, files);
      const updates = new MongooseSiteUpdateStore(connection, (session) => new
      PageLanguageUsageAdapter(connection.model<IPageRecord>('Page', pageSchema), session), () => new
      Date(), hookEvents);

      return {
        forSession(token): IAdminRoutingOperations {
          const operations = content.forSession(token);
          const access = new SessionContentAccessAdapter(current, token);
          const publication = new PublishRoutingReleaseUseCase(access, operations.getSite, source, activation,
            store, new RoutingReleaseBuildAdapter(store, jsonLdReleaseProjection()),
            { nextReleaseId: randomUUID, now: () => new Date() }, hooks);
          const change = new ChangePublishedPageUrlUseCase(new ChangePageUrlUseCase(urls, new
          RoutingPageLookupAdapter(operations.getPage), new UrlCreationValuesAdapter(), access, source, hooks),
          publication, access);
          const redirect = new RedirectPublishedUrlUseCase(new RedirectUrlUseCase(urls, urls, {
            nextVersion: randomUUID, nextHistoryId: randomUUID, currentInstant: () => new Date(),
          }, { requireEditor: (siteId, actorId) => access.assertEditor(siteId, actorId) }, hooks), publication, access);

          return {
            materialize: {
              execute: async (input) => new MaterializeVirtualUrlUseCase(new MongooseVirtualUrlStore(models,
                connection.model<IPageRecord>('Page', pageSchema), hookEvents), access,
              new UrlCreationValuesAdapter(), publication, hooks)
                .execute({ ...input, actorId: (await current.execute({ token })).user.adminUserId }),
            },
            search: new SearchUrlsUseCase(access, urls, new MongooseUrlSearchAdapter(models.urls)),
            catalog: new GetUrlCatalogUseCase(access, operations.getSite, operations.listPages, source, urls,
              published),
            history: new GetUrlHistoryUseCase(urls, access),
            change: {
              execute: async (input) => change.execute({
                ...input,
                actorId: (await current.execute({ token })).user.adminUserId,
              }),
            },
            publishRouting: {
              execute: async (siteId) => publication.execute({
                siteId,
                actorId: (await current.execute({ token })).user.adminUserId,
              }),
            },
            redirect: {
              execute: async (input) => redirect.execute({
                ...input,
                actorId: (await current.execute({ token })).user.adminUserId,
              }),
            },
            getSite: operations.getSite,
            updateSite: new UpdateSiteUseCase(sites, updates, access, undefined, hooks),
          };
        },
      };
    },
  }, {
    provide: AdminRoutingController,
    inject: [ADMIN_ROUTING_OPERATIONS],
    useFactory: (operations: IAdminRoutingOperationFactory) => new AdminRoutingController(auth, operations),
  }];
}
