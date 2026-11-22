import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  MongooseLegacyAssetLookupAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/legacy-asset-lookup.adapter.js';
import { publicationModels } from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { FilePublishedContentAdapter } from '../../adapters/outbound/publication/files/published-content.adapter.js';
import {
  type IRequestCacheMemorySettings, MemoryRequestDocumentCacheAdapter,
} from '../../adapters/outbound/publication/memory/request-document-cache.adapter.js';
import { DocumentOutputAdapter } from '../../adapters/outbound/rendering/html/document-output.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import type { IRenderRuntime } from '../../app/services/publication/render-data.service.js';
import { RequestDocumentCacheService } from '../../app/services/publication/request-document-cache.service.js';
import { GetPublishedArtifactUseCase } from '../../app/use-cases/publication/get-published-artifact.use-case.js';
import { RenderPublishedPageUseCase } from '../../app/use-cases/publication/render-published-page.use-case.js';
import type { IRenderObservationPort } from '../../ports/outbound/diagnostics/render-observation.port.js';
import type { IDocumentOutputPort } from '../../ports/outbound/publication/document-output.port.js';
import type { IMarkdownConversionPort } from '../../ports/outbound/publication/markdown-conversion.port.js';
import type {
  ILegacyAssetLookupPort,
  IPublicArtifactPort,
} from '../../ports/outbound/publication/public-artifact.port.js';
import type { IPublishedPlanPort } from '../../ports/outbound/publication/published-plan.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { IRequestDocumentCachePort } from '../../ports/outbound/publication/request-document-cache.port.js';
import type { IRequestDocumentRefreshPort } from '../../ports/outbound/publication/request-document-refresh.port.js';
import { RENDER_OBSERVATION } from '../diagnostics/diagnostics.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { REQUEST_DOCUMENT_REFRESH } from './publication.tokens.js';
import {
  DOCUMENT_OUTPUT, GET_PUBLISHED_ARTIFACT, LEGACY_ASSET_LOOKUP, MARKDOWN_CONVERSION, PUBLISHED_CONTENT,
  RELEASE_ACTIVATION, RENDER_PUBLISHED_PAGE, RENDER_RUNTIME,
} from './publication.tokens.js';
import { REQUEST_DOCUMENT_CACHE, REQUEST_DOCUMENT_CACHE_STORAGE } from './publication.tokens.js';

export function publishedDeliveryProviders(artifactsRoot: string,
  cacheSettings?: IRequestCacheMemorySettings): Provider[] {
  return [
    { provide: REQUEST_DOCUMENT_CACHE_STORAGE, useFactory: () => new MemoryRequestDocumentCacheAdapter(cacheSettings) },
    {
      provide: REQUEST_DOCUMENT_CACHE,
      inject: [REQUEST_DOCUMENT_CACHE_STORAGE],
      useFactory: (store: IRequestDocumentCachePort) => new RequestDocumentCacheService(store),
    },
    {
      provide: LEGACY_ASSET_LOOKUP,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongooseLegacyAssetLookupAdapter(publicationModels(connection)),
    },
    {
      provide: GET_PUBLISHED_ARTIFACT,
      inject: [PUBLISHED_CONTENT, RELEASE_ACTIVATION, LEGACY_ASSET_LOOKUP],
      useFactory: (content: IPublicArtifactPort, activation: IReleaseActivationPort, legacy: ILegacyAssetLookupPort) =>
        new GetPublishedArtifactUseCase(content, activation, legacy),
    },
    {
      provide: PUBLISHED_CONTENT,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new FilePublishedContentAdapter(artifactsRoot, publicationModels(connection).releases,
          new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: DOCUMENT_OUTPUT,
      inject: [{
        token: RENDER_OBSERVATION,
        optional: true,
      }],
      useFactory: (observation?: IRenderObservationPort) =>
        new DocumentOutputAdapter(observation),
    },
    { provide: MARKDOWN_CONVERSION, useFactory: () => new MarkdownConversionAdapter() },
    {
      provide: RENDER_PUBLISHED_PAGE,
      inject: [PUBLISHED_CONTENT,
        RENDER_RUNTIME,
        DOCUMENT_OUTPUT,
        RELEASE_ACTIVATION,
        MARKDOWN_CONVERSION,
        REQUEST_DOCUMENT_CACHE, REQUEST_DOCUMENT_CACHE_STORAGE, REQUEST_DOCUMENT_REFRESH,
        {
          token: RENDER_OBSERVATION,
          optional: true,
        }],
      useFactory: (content: IPublishedPlanPort, runtime: IRenderRuntime, output: IDocumentOutputPort,
        activation: IReleaseActivationPort, markdown: IMarkdownConversionPort,
        cache: RequestDocumentCacheService, cacheStore: IRequestDocumentCachePort,
        refresh: IRequestDocumentRefreshPort,
        observation?: IRenderObservationPort) =>
        new RenderPublishedPageUseCase(
          content, runtime, output, activation, markdown, observation, cache, cacheStore, refresh,
        ),
    },
  ];
}
