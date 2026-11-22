import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { publicationModels } from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  MongooseReleaseActivationAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/release-activation.adapter.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { FilePublicationStoreAdapter } from '../../adapters/outbound/publication/files/publication-store.adapter.js';
import type {
  IRequestCacheMemorySettings,
} from '../../adapters/outbound/publication/memory/request-document-cache.adapter.js';
import {
  VerifiedPublicationCatalogAdapter,
} from '../../adapters/outbound/publication/memory/verified-publication-catalog.adapter.js';
import { JsonLdDocumentAdapter } from '../../adapters/outbound/rendering/html/json-ld-document.adapter.js';
import { LoaderExecutionAdapter } from '../../adapters/outbound/rendering/modx/loader-execution.adapter.js';
import {
  type ISnippetPoolSettings, SnippetWorkerPool,
} from '../../adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { ModxCompositionAdapter } from '../../adapters/outbound/rendering/modx/template-composition.adapter.js';
import {
  RequestRefreshWorkerAdapter,
} from '../../adapters/outbound/rendering/workers/request-refresh-worker.adapter.js';
import { JsonLdRenderRuntimeService } from '../../app/services/json-ld/json-ld-render-runtime.service.js';
import { RenderDataService } from '../../app/services/publication/render-data.service.js';
import {
  type ISnippetConcurrencySettings, SnippetSchedulerService,
} from '../../app/services/publication/snippet-scheduler.service.js';
import { BuildJsonLdPageUseCase } from '../../app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { FindPublishedPagesUseCase } from '../../app/use-cases/publication/find-published-pages.use-case.js';
import { ResolvePublishedPathUseCase } from '../../app/use-cases/publication/resolve-published-path.use-case.js';
import type { ICmsSnippetApiPort } from '../../ports/outbound/cms/snippet-api.port.js';
import type { IDataLoader } from '../../ports/outbound/publication/data-loader.port.js';
import type { ILoaderExecutionPort } from '../../ports/outbound/publication/loader-execution.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IPublishedPageCatalogPort } from '../../ports/outbound/publication/published-page-catalog.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ITemplateCompositionPort } from '../../ports/outbound/publication/template-composition.port.js';
import { CMS_SNIPPET_API } from '../cms/cms.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { jsonLdCatalogProvider } from '../json-ld/json-ld.providers.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { SNIPPET_WORKER_POOL } from '../rendering/rendering.tokens.js';
import { SNIPPET_SCHEDULER } from '../rendering/rendering.tokens.js';
import { registeredSnippets } from '../rendering/snippets.js';
import {
  COMPOSITION,
  FIND_PUBLISHED_PAGES,
  LOADER_EXECUTION,
  PUBLICATION_STORE,
  PUBLISHED_PAGE_CATALOG,
  RELEASE_ACTIVATION,
  RENDER_RUNTIME,
  REQUEST_DOCUMENT_REFRESH,
  RESOLVE_PUBLISHED_PATH,
} from './publication.tokens.js';
import { publishedDeliveryProviders } from './published-delivery.providers.js';

export interface IPublishedRuntimeSettings {
  readonly artifactsRoot?: string;
  readonly loaders?: readonly IDataLoader[];
  readonly loaderTimeoutMs?: number;
  readonly snippetPool?: ISnippetPoolSettings;
  readonly snippetConcurrency?: ISnippetConcurrencySettings;
  readonly requestCache?: IRequestCacheMemorySettings;
}

import type { IRenderObservationPort } from '../../ports/outbound/diagnostics/render-observation.port.js';
import { RENDER_OBSERVATION } from '../diagnostics/diagnostics.tokens.js';

export function publishedRuntimeProviders(settings: IPublishedRuntimeSettings): Provider[] {
  const root = settings.artifactsRoot ?? path.resolve('artifacts');
  const snippets = registeredSnippets(settings.loaders);

  return [
    ...publishedDeliveryProviders(root, settings.requestCache),
    {
      provide: REQUEST_DOCUMENT_REFRESH,
      inject: [LOADER_EXECUTION],
      useFactory: (loaders: ILoaderExecutionPort) => new RequestRefreshWorkerAdapter(
        new URL(import.meta.url.endsWith('.ts')
          ? '../../../dist/infra/publication/request-refresh-worker.js' : './request-refresh-worker.js',
        import.meta.url), loaders, snippets.map((snippet) => ({
          id: snippet.id,
          parameters: snippet.parameters,
          output: snippet.output,
          phases: snippet.phases,
          ...(snippet.cache ? { cache: snippet.cache } : {}),
          ...(snippet.execution ? { execution: snippet.execution } : {}),
          ...(snippet.fallback !== undefined ? { fallback: snippet.fallback } : {}),
        }))),
    },
    { provide: SNIPPET_WORKER_POOL, useFactory: () => new SnippetWorkerPool(settings.snippetPool) },
    jsonLdCatalogProvider,
    { provide: SNIPPET_SCHEDULER, useFactory: () => new SnippetSchedulerService(settings.snippetConcurrency) },
    {
      provide: COMPOSITION,
      inject: [{
        token: RENDER_OBSERVATION,
        optional: true,
      }],
      useFactory: (observation?: IRenderObservationPort) =>
        new ModxCompositionAdapter(snippets,
          observation),
    },
    {
      provide: LOADER_EXECUTION,
      inject: [
        { token: CMS_SNIPPET_API, optional: true }, { token: RENDER_OBSERVATION, optional: true }, SNIPPET_WORKER_POOL,
      ],
      useFactory: (cms: ICmsSnippetApiPort | undefined,
        observation: IRenderObservationPort | undefined, pool: SnippetWorkerPool) =>
        new LoaderExecutionAdapter(snippets,
          cms,
          observation, pool),
    },
    {
      provide: RENDER_RUNTIME,
      inject: [COMPOSITION, LOADER_EXECUTION, { token: RENDER_OBSERVATION, optional: true }, SNIPPET_SCHEDULER],
      useFactory: (composition: ITemplateCompositionPort,
        loaders: ILoaderExecutionPort,
        observation: IRenderObservationPort | undefined, scheduler: SnippetSchedulerService) =>
        new JsonLdRenderRuntimeService(new RenderDataService(composition,
          loaders,
          settings.loaderTimeoutMs ?? 10000,
          observation, scheduler),
        new BuildJsonLdPageUseCase(), new JsonLdDocumentAdapter(), observation),
    },
    {
      provide: PUBLICATION_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new FilePublicationStoreAdapter(root, publicationModels(connection).releases,
          new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: RELEASE_ACTIVATION,
      inject: [MONGO_CONNECTION, PUBLICATION_STORE, HOOK_EVENTS],
      useFactory: (connection: Connection, store: IPublicationStorePort, hookEvents: MongooseHookEvents) =>
        new MongooseReleaseActivationAdapter(publicationModels(connection), store, hookEvents),
    },
    {
      provide: PUBLISHED_PAGE_CATALOG,
      inject: [PUBLICATION_STORE],
      useFactory: (store: IPublicationStorePort) => new VerifiedPublicationCatalogAdapter(store),
    },
    {
      provide: FIND_PUBLISHED_PAGES,
      inject: [RELEASE_ACTIVATION, PUBLISHED_PAGE_CATALOG],
      useFactory: (activation: IReleaseActivationPort, catalog: IPublishedPageCatalogPort) =>
        new FindPublishedPagesUseCase(activation, catalog),
    },
    {
      provide: RESOLVE_PUBLISHED_PATH,
      inject: [RELEASE_ACTIVATION, PUBLICATION_STORE],
      useFactory: (activation: IReleaseActivationPort, store: IPublicationStorePort) =>
        new ResolvePublishedPathUseCase(activation, store),
    },
  ];
}
