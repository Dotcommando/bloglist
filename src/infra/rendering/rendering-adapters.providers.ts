import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  elementSchema, type IElementRecord,
} from '../../adapters/outbound/persistence/mongoose/rendering/element.schema.js';
import {
  elementKeySchema, type IElementKeyRecord, MongooseElementKeys,
} from '../../adapters/outbound/persistence/mongoose/rendering/element-keys.adapter.js';
import { MongooseElementStore } from '../../adapters/outbound/persistence/mongoose/rendering/element-store.adapter.js';
import { BasicRenderingSourceAdapter } from '../../adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import { FileElementBackupAdapter } from '../../adapters/outbound/rendering/files/element-backup.adapter.js';
import { FileElementFallbackAdapter } from '../../adapters/outbound/rendering/files/element-fallback.adapter.js';
import { FileRenderingSourceAdapter } from '../../adapters/outbound/rendering/files/rendering-source.adapter.js';
import { RenderingElementUsagesAdapter } from '../../adapters/outbound/rendering/modx/element-usages.adapter.js';
import { RenderingCatalogService } from '../../app/services/rendering/rendering-catalog.service.js';
import type { IListPages } from '../../ports/inbound/pages/list-pages.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import type { IElementFallback } from '../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../ports/outbound/rendering/element-store.port.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { LIST_PAGES } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { RENDERING_SOURCE } from '../publication/publication.tokens.js';
import {
  ELEMENT_BACKUP, ELEMENT_CATALOG, ELEMENT_FALLBACK, ELEMENT_KEYS, ELEMENT_STORE, ELEMENT_USAGES, ELEMENT_VALUES,
} from './rendering.tokens.js';

export function renderingAdapterProviders(root: string): Provider[] {
  const files = new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter());

  return [
    {
      provide: ELEMENT_KEYS,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongooseElementKeys(connection.model<IElementKeyRecord>('RenderingElementKeys', elementKeySchema)),
    },
    {
      provide: ELEMENT_STORE,
      inject: [MONGO_CONNECTION, HOOK_EVENTS],
      useFactory: (connection: Connection, events: MongooseHookEvents) =>
        new MongooseElementStore(connection.model<IElementRecord>('RenderingElement', elementSchema), events),
    },
    { provide: ELEMENT_FALLBACK, useFactory: () => new FileElementFallbackAdapter(files) },
    { provide: ELEMENT_BACKUP, useFactory: () => new FileElementBackupAdapter(root, files) },
    {
      provide: ELEMENT_VALUES,
      useFactory: () => ({ nextId: randomUUID, nextVersion: randomUUID, now: () => new Date() }),
    },
    {
      provide: ELEMENT_CATALOG,
      inject: [ELEMENT_STORE, ELEMENT_FALLBACK],
      useFactory: (store: IElementStore, fallback: IElementFallback) => new RenderingCatalogService(store, fallback),
    },
  ];
}

export const localElementUsagesProvider: Provider = {
  provide: ELEMENT_USAGES,
  inject: [RENDERING_SOURCE, LIST_PAGES],
  useFactory: (sources: IRenderingSourcePort, pages: IListPages) => new RenderingElementUsagesAdapter(sources, pages),
};
