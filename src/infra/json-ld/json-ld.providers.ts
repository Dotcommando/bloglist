import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  type IJsonLdCatalogRecord,
  jsonLdCatalogSchema,
  MongooseJsonLdCatalog,
} from '../../adapters/outbound/persistence/mongoose/json-ld/json-ld-catalog.adapter.js';
import { JsonLdReferenceOwnershipService } from '../../app/services/json-ld/json-ld-reference-ownership.service.js';
import { BuildJsonLdPageUseCase } from '../../app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { ListJsonLdCatalogUseCase } from '../../app/use-cases/json-ld/list-json-ld-catalog.use-case.js';
import { SaveJsonLdCatalogUseCase } from '../../app/use-cases/json-ld/save-json-ld-catalog.use-case.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import type { IGetUrlCatalog } from '../../ports/inbound/routing/get-url-catalog.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IJsonLdCatalogReader, IJsonLdCatalogStore } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { IElementCatalog } from '../../ports/outbound/rendering/element-sources.port.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { ELEMENT_CATALOG } from '../rendering/rendering.tokens.js';
import { GET_URL_CATALOG } from '../routing/routing.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import {
  BUILD_JSON_LD_PAGE, JSON_LD_CATALOG_READER, LIST_JSON_LD_CATALOG, SAVE_JSON_LD_CATALOG,
} from './json-ld.tokens.js';

export const jsonLdCatalogProvider: Provider = {
  provide: JSON_LD_CATALOG_READER,
  inject: [MONGO_CONNECTION],
  useFactory: (connection: Connection) => new MongooseJsonLdCatalog(
    connection.model<IJsonLdCatalogRecord>('JsonLdCatalog', jsonLdCatalogSchema),
  ),
};

export const jsonLdProviders: Provider[] = [
  jsonLdCatalogProvider,
  { provide: BUILD_JSON_LD_PAGE, useFactory: () => new BuildJsonLdPageUseCase() },
  {
    provide: LIST_JSON_LD_CATALOG,
    inject: [GET_SITE, JSON_LD_CATALOG_READER],
    useFactory: (sites: IGetSite, store: IJsonLdCatalogReader) => new ListJsonLdCatalogUseCase(sites, store),
  },
  {
    provide: SAVE_JSON_LD_CATALOG,
    inject: [GET_SITE, JSON_LD_CATALOG_READER, ELEMENT_CATALOG, GET_URL_CATALOG],
    useFactory: (sites: IGetSite, store: IJsonLdCatalogStore, elements: IElementCatalog, routing: IGetUrlCatalog) =>
      new SaveJsonLdCatalogUseCase(sites, store,
        { list: (siteId) => elements.list(siteId, TemplateSourceKind.Template) },
        new JsonLdReferenceOwnershipService(routing), randomUUID),
  },
];
