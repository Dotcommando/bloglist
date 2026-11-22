import type { Provider } from '@nestjs/common';

import { CompleteElementSaveService } from '../../app/services/rendering/complete-element-save.service.js';
import { CreateRenderingElementUseCase } from '../../app/use-cases/rendering/create-rendering-element.use-case.js';
import { GetRenderingElementUseCase } from '../../app/use-cases/rendering/get-rendering-element.use-case.js';
import { ListRenderingElementsUseCase } from '../../app/use-cases/rendering/list-rendering-elements.use-case.js';
import { PreviewRenderingElementUseCase } from '../../app/use-cases/rendering/preview-rendering-element.use-case.js';
import {
  UpdateAndRepublishRenderingElementUseCase,
} from '../../app/use-cases/rendering/update-and-republish-rendering-element.use-case.js';
import { UpdateRenderingElementUseCase } from '../../app/use-cases/rendering/update-rendering-element.use-case.js';
import type { IPreviewPage } from '../../ports/inbound/publication/preview-page.port.js';
import type { IRepublishSnippetPages } from '../../ports/inbound/publication/republish-snippet-pages.port.js';
import type {
  IGetRenderingElement, IRenderingOperations,
} from '../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IElementKeys } from '../../ports/outbound/rendering/element-keys.port.js';
import type {
  IElementBackup, IElementCatalog, IElementPagePreview, IElementUsages, IElementValues,
} from '../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../ports/outbound/rendering/element-store.port.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { PREVIEW_PAGE } from '../publication/publication.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { REPUBLISH_SNIPPET_PAGES } from './rendering.tokens.js';
import {
  CREATE_RENDERING_ELEMENT, ELEMENT_BACKUP, ELEMENT_CATALOG, ELEMENT_KEYS, ELEMENT_STORE, ELEMENT_USAGES,
  ELEMENT_VALUES, GET_RENDERING_ELEMENT, LIST_RENDERING_ELEMENTS, PREVIEW_RENDERING_ELEMENT, UPDATE_RENDERING_ELEMENT,
} from './rendering.tokens.js';

export function renderingOperations(sites: IGetSite, catalog: IElementCatalog, store: IElementStore,
  backup: IElementBackup, values: IElementValues, usages: IElementUsages,
  preview: IElementPagePreview, keys: IElementKeys, hooks: IHookChangesPort,
  republication: IRepublishSnippetPages): IRenderingOperations {
  const persistence = new CompleteElementSaveService(store, backup, hooks);
  const get = new GetRenderingElementUseCase(sites, catalog, usages);

  return {
    list: new ListRenderingElementsUseCase(sites, catalog),
    get,
    create: new CreateRenderingElementUseCase(sites, catalog, persistence, values, keys),
    update: new UpdateAndRepublishRenderingElementUseCase(new UpdateRenderingElementUseCase(sites, catalog,
      store, persistence, values), republication),
    preview: new PreviewRenderingElementUseCase(get, preview),
  };
}

export function renderingUseCaseProviders(actorId: string): Provider[] {
  return [
    {
      provide: LIST_RENDERING_ELEMENTS,
      inject: [GET_SITE, ELEMENT_CATALOG],
      useFactory: (sites: IGetSite, catalog: IElementCatalog) => new ListRenderingElementsUseCase(sites, catalog),
    },
    {
      provide: GET_RENDERING_ELEMENT,
      inject: [GET_SITE, ELEMENT_CATALOG, ELEMENT_USAGES],
      useFactory: (sites: IGetSite, catalog: IElementCatalog, usages: IElementUsages) =>
        new GetRenderingElementUseCase(sites, catalog, usages),
    },
    {
      provide: CREATE_RENDERING_ELEMENT,
      inject: [GET_SITE, ELEMENT_CATALOG, ELEMENT_STORE, ELEMENT_BACKUP, ELEMENT_VALUES, ELEMENT_KEYS, HOOK_CHANGES],
      useFactory: (sites: IGetSite, catalog: IElementCatalog, store: IElementStore, backup: IElementBackup,
        values: IElementValues, keys: IElementKeys, hooks: IHookChangesPort) => new
      CreateRenderingElementUseCase(sites, catalog,
        new CompleteElementSaveService(store, backup, hooks), values, keys),
    },
    {
      provide: UPDATE_RENDERING_ELEMENT,
      inject: [GET_SITE, ELEMENT_CATALOG, ELEMENT_STORE, ELEMENT_BACKUP, ELEMENT_VALUES, HOOK_CHANGES,
        REPUBLISH_SNIPPET_PAGES],
      useFactory: (sites: IGetSite, catalog: IElementCatalog, store: IElementStore, backup: IElementBackup,
        values: IElementValues, hooks: IHookChangesPort,
        republication: IRepublishSnippetPages) => new UpdateAndRepublishRenderingElementUseCase(
        new UpdateRenderingElementUseCase(sites, catalog, store,
          new CompleteElementSaveService(store, backup, hooks), values), republication),
    },
    {
      provide: PREVIEW_RENDERING_ELEMENT,
      inject: [GET_RENDERING_ELEMENT, PREVIEW_PAGE],
      useFactory: (get: IGetRenderingElement, preview: IPreviewPage) => new PreviewRenderingElementUseCase(get,
        { execute: (input) => preview.execute({ ...input, actorId }) }),
    },
  ];
}
