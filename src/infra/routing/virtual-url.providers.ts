import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseVirtualUrlStore,
} from '../../adapters/outbound/persistence/mongoose/routing/virtual-url-store.adapter.js';
import { MaterializeVirtualUrlUseCase } from '../../app/use-cases/routing/materialize-virtual-url.use-case.js';
import type { IPublishRoutingRelease } from '../../ports/inbound/publication/publish-routing-release.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IPublicationAccessPort } from '../../ports/outbound/publication/publication-access.port.js';
import type { IUrlCreationValues } from '../../ports/outbound/routing/url-creation-values.port.js';
import type { IVirtualUrlStore } from '../../ports/outbound/routing/virtual-url-store.port.js';
import { HOOK_CHANGES, HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { PUBLICATION_ACCESS, PUBLISH_ROUTING_RELEASE } from '../publication/publication.tokens.js';
import { MATERIALIZE_VIRTUAL_URL, URL_VALUES, VIRTUAL_URL_STORE } from './routing.tokens.js';

export function virtualUrlProviders(): Provider[] {
  return [{
    provide: VIRTUAL_URL_STORE,
    inject: [MONGO_CONNECTION, HOOK_EVENTS],
    useFactory: (connection: Connection, events: MongooseHookEvents) => new MongooseVirtualUrlStore(
      createRoutingModels(connection), connection.model<IPageRecord>('Page', pageSchema), events),
  }, {
    provide: MATERIALIZE_VIRTUAL_URL,
    inject: [VIRTUAL_URL_STORE, PUBLICATION_ACCESS, URL_VALUES, PUBLISH_ROUTING_RELEASE, HOOK_CHANGES],
    useFactory: (store: IVirtualUrlStore, access: IPublicationAccessPort,
      values: IUrlCreationValues, publish: IPublishRoutingRelease, hooks: IHookChangesPort) =>
      new MaterializeVirtualUrlUseCase(store, access, values, publish, hooks),
  }];
}
