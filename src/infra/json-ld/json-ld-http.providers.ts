import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';

import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import {
  AdminJsonLdController, type IAdminJsonLdFactory,
} from '../../adapters/inbound/rest/json-ld/admin-json-ld.controller.js';
import type {
  IAdminRoutingOperationFactory,
} from '../../adapters/inbound/rest/routing/admin-routing-operations.factory.js';
import { JsonLdReferenceOwnershipService } from '../../app/services/json-ld/json-ld-reference-ownership.service.js';
import { ListJsonLdCatalogUseCase } from '../../app/use-cases/json-ld/list-json-ld-catalog.use-case.js';
import { SaveJsonLdCatalogUseCase } from '../../app/use-cases/json-ld/save-json-ld-catalog.use-case.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import type { IJsonLdCatalogStore } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { IElementCatalog } from '../../ports/outbound/rendering/element-sources.port.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { ELEMENT_CATALOG } from '../rendering/rendering.tokens.js';
import { ADMIN_ROUTING_OPERATIONS } from '../routing/routing.tokens.js';
import { jsonLdCatalogProvider } from './json-ld.providers.js';
import { ADMIN_JSON_LD_OPERATIONS, JSON_LD_CATALOG_READER } from './json-ld.tokens.js';

export function jsonLdHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [jsonLdCatalogProvider, {
    provide: ADMIN_JSON_LD_OPERATIONS,
    inject: [ADMIN_CONTENT_OPERATIONS, ADMIN_ROUTING_OPERATIONS, ELEMENT_CATALOG, JSON_LD_CATALOG_READER],
    useFactory: (content: IAdminContentOperationFactory, routing: IAdminRoutingOperationFactory,
      elements: IElementCatalog, store: IJsonLdCatalogStore): IAdminJsonLdFactory => ({
      forSession(token): ReturnType<IAdminJsonLdFactory['forSession']> {
        const sites = content.forSession(token).getSite;
        const routes = routing.forSession(token).catalog;

        return {
          list: new ListJsonLdCatalogUseCase(sites, store),
          save: new SaveJsonLdCatalogUseCase(sites, store,
            { list: (siteId) => elements.list(siteId, TemplateSourceKind.Template) },
            new JsonLdReferenceOwnershipService(routes), randomUUID),
        };
      },
    }),
  }, {
    provide: AdminJsonLdController,
    inject: [ADMIN_JSON_LD_OPERATIONS],
    useFactory: (operations: IAdminJsonLdFactory) => new AdminJsonLdController(auth, operations),
  }];
}
