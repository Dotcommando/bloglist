import type { Provider } from '@nestjs/common';

import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import {
  AdminTemplateVariablesController,
  type IAdminTemplateVariableFactory,
} from '../../adapters/inbound/rest/template-variables/admin-template-variables.controller.js';
import type { ITemplateVariableOperations } from '../../ports/inbound/template-variables/template-variables.port.js';
import type { IElementCatalog } from '../../ports/outbound/rendering/element-sources.port.js';
import type {
  IPageTemplateVariableStore,
  ITemplateVariableMedia,
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../ports/outbound/template-variables/template-variables.port.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { ELEMENT_CATALOG } from '../rendering/rendering.tokens.js';
import { templateVariableOperations, templateVariableProviders } from './template-variables.providers.js';
import { ADMIN_TV_OPERATIONS, TV_MEDIA, TV_PAGE_STORE, TV_PUBLICATION, TV_STORE } from './template-variables.tokens.js';

export function templateVariableHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [
    ...templateVariableProviders(settings.media?.publicBaseUrl ?? null),
    {
      provide: ADMIN_TV_OPERATIONS,
      inject: [ADMIN_CONTENT_OPERATIONS, ELEMENT_CATALOG, TV_STORE, TV_MEDIA, TV_PAGE_STORE, TV_PUBLICATION],
      useFactory: (content: IAdminContentOperationFactory, catalog: IElementCatalog,
        definitions: ITemplateVariableStore,
        media: ITemplateVariableMedia, store: IPageTemplateVariableStore,
        projection: ITemplateVariablePublication): IAdminTemplateVariableFactory => ({
        forSession(token): ITemplateVariableOperations {
          const operations = content.forSession(token);

          return templateVariableOperations(operations.getSite, operations.getPage, catalog, definitions,
            media, store, projection);
        },
      }),
    },
    {
      provide: AdminTemplateVariablesController,
      inject: [ADMIN_TV_OPERATIONS],
      useFactory: (operations: IAdminTemplateVariableFactory) => new AdminTemplateVariablesController(auth, operations),
    },
  ];
}
