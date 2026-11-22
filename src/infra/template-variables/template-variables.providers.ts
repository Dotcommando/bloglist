import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { mediaLibraryModel } from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import {
  TemplateVariableMediaAdapter,
} from '../../adapters/outbound/persistence/mongoose/media/template-variable-media.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { MongoosePageTemplateVariables }
  from '../../adapters/outbound/persistence/mongoose/pages/page-template-variables.adapter.js';
import {
  type ITemplateVariableRecord,
  MongooseTemplateVariables,
  templateVariableSchema,
} from '../../adapters/outbound/persistence/mongoose/template-variables/template-variables.adapter.js';
import { TemplateVariableService } from '../../app/services/template-variables/template-variable.service.js';
import {
  GetPageTemplateVariablesUseCase,
} from '../../app/use-cases/template-variables/get-page-template-variables.use-case.js';
import {
  ListTemplateVariablesUseCase,
} from '../../app/use-cases/template-variables/list-template-variables.use-case.js';
import {
  SavePageTemplateVariablesUseCase,
} from '../../app/use-cases/template-variables/save-page-template-variables.use-case.js';
import {
  SaveTemplateVariablesUseCase,
} from '../../app/use-cases/template-variables/save-template-variables.use-case.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import type { IGetPage } from '../../ports/inbound/pages/get-page.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { ITemplateVariableOperations } from '../../ports/inbound/template-variables/template-variables.port.js';
import type { IElementCatalog } from '../../ports/outbound/rendering/element-sources.port.js';
import type {
  IPageTemplateVariableStore,
  ITemplateVariableMedia,
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../ports/outbound/template-variables/template-variables.port.js';
import { GET_PAGE } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { ELEMENT_CATALOG } from '../rendering/rendering.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { TV_MEDIA, TV_OPERATIONS, TV_PAGE_STORE, TV_PUBLICATION, TV_STORE } from './template-variables.tokens.js';

export function templateVariableOperations(sites: IGetSite, pages: IGetPage, catalog: IElementCatalog,
  definitions: ITemplateVariableStore, media: ITemplateVariableMedia, store: IPageTemplateVariableStore,
  projection: ITemplateVariablePublication): ITemplateVariableOperations {
  const templates = { list: (siteId: string) => catalog.list(siteId, TemplateSourceKind.Template) };
  const list = new ListTemplateVariablesUseCase(sites, definitions);

  return {
    list,
    save: new SaveTemplateVariablesUseCase(sites, definitions, templates, randomUUID, media),
    getPage: new GetPageTemplateVariablesUseCase(list, pages, media, projection),
    savePage: new SavePageTemplateVariablesUseCase(sites, pages, definitions, templates, media, store),
  };
}

export function templateVariableProviders(publicPath: string | null): Provider[] {
  return [
    {
      provide: TV_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongooseTemplateVariables(connection.model<ITemplateVariableRecord>('TemplateVariables',
          templateVariableSchema)),
    },
    {
      provide: TV_MEDIA,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new TemplateVariableMediaAdapter(mediaLibraryModel(connection), publicPath),
    },
    {
      provide: TV_PAGE_STORE,
      inject: [MONGO_CONNECTION, TV_STORE, TV_MEDIA],
      useFactory: (connection: Connection, definitions: MongooseTemplateVariables,
        media: TemplateVariableMediaAdapter) =>
        new MongoosePageTemplateVariables(connection, connection.model<IPageRecord>('Page', pageSchema),
          () => new Date(), (siteId, version, session) => definitions.guard(siteId, version, session),
          (siteId, version, session) => media.guard(siteId, version, session)),
    },
    {
      provide: TV_PUBLICATION,
      inject: [TV_STORE, TV_MEDIA],
      useFactory: (store: ITemplateVariableStore, media: ITemplateVariableMedia) =>
        new TemplateVariableService(store, media),
    },
  ];
}

export const localTemplateVariableProvider: Provider = {
  provide: TV_OPERATIONS,
  inject: [GET_SITE, GET_PAGE, ELEMENT_CATALOG, TV_STORE, TV_MEDIA, TV_PAGE_STORE, TV_PUBLICATION],
  useFactory: templateVariableOperations,
};
