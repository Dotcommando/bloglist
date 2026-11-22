import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { LocalAssetAccessAdapter } from '../../adapters/outbound/access/local/media/local-asset-access.adapter.js';
import { AssetInspectionAdapter } from '../../adapters/outbound/media/sharp/asset-inspection.adapter.js';
import { SharpImageProcessingAdapter } from '../../adapters/outbound/media/sharp/image-processing.adapter.js';
import {
  assetModel,
  MongooseAssetRepository,
} from '../../adapters/outbound/persistence/mongoose/media/asset.repository.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { FileAssetStorageAdapter } from '../../adapters/outbound/storage/files/media/asset-storage.adapter.js';
import { GetAssetUseCase } from '../../app/use-cases/media/get-asset.use-case.js';
import { ProcessAssetUseCase } from '../../app/use-cases/media/process-asset.use-case.js';
import { UploadAssetUseCase } from '../../app/use-cases/media/upload-asset.use-case.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IAssetRepository } from '../../ports/outbound/media/asset.repository.js';
import type { IAssetAccessPort } from '../../ports/outbound/media/asset-access.port.js';
import type { IAssetInspectionPort } from '../../ports/outbound/media/asset-inspection.port.js';
import type { IAssetStoragePort } from '../../ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../ports/outbound/media/asset-values.port.js';
import type { IImageProcessingPort } from '../../ports/outbound/media/image-processing.port.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { GET_ASSET } from './media.tokens.js';
import { IMAGE_PROCESSING, PROCESS_ASSET } from './media.tokens.js';
import {
  ASSET_ACCESS,
  ASSET_INSPECTION,
  ASSET_REPOSITORY,
  ASSET_STORAGE,
  ASSET_VALUES,
  UPLOAD_ASSET,
} from './media.tokens.js';
import { siteAssetDirectoryProviders } from './site-asset-directory.providers.js';

export function mediaProviders(settings: ILocalApplicationSettings): Provider[] {
  if (!settings.media) {
    return siteAssetDirectoryProviders(settings.media, settings.rendering?.artifactsRoot);
  }

  const media = settings.media;

  return [
    ...siteAssetDirectoryProviders(media, settings.rendering?.artifactsRoot),
    {
      provide: GET_ASSET,
      inject: [ASSET_REPOSITORY, ASSET_ACCESS, ASSET_STORAGE],
      useFactory: (repo: IAssetRepository, access: IAssetAccessPort, storage: IAssetStoragePort) =>
        new GetAssetUseCase(repo, access, storage),
    },
    { provide: IMAGE_PROCESSING, useFactory: () => new SharpImageProcessingAdapter() },
    {
      provide: PROCESS_ASSET,
      inject: [ASSET_REPOSITORY, ASSET_STORAGE, IMAGE_PROCESSING, ASSET_ACCESS, ASSET_VALUES],
      useFactory: (repo: IAssetRepository, storage: IAssetStoragePort, images: IImageProcessingPort,
        access: IAssetAccessPort, values: IAssetValuesPort) =>
        new ProcessAssetUseCase(repo, storage, images, access, values),
    },
    {
      provide: ASSET_REPOSITORY,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseAssetRepository(assetModel(connection)),
    },
    {
      provide: ASSET_STORAGE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new FileAssetStorageAdapter(media.root, media.publicBaseUrl,
          new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    { provide: ASSET_INSPECTION, useFactory: () => new AssetInspectionAdapter() },
    {
      provide: ASSET_ACCESS,
      inject: [GET_SITE],
      useFactory: (sites: IGetSite) => new LocalAssetAccessAdapter(settings.operator, sites),
    },
    {
      provide: ASSET_VALUES,
      useValue: {
        nextId: randomUUID, nextAssetVersion: randomUUID, nextMetadataVersion: randomUUID, now: () => new Date(),
      },
    },
    {
      provide: UPLOAD_ASSET,
      inject: [ASSET_REPOSITORY, ASSET_STORAGE, ASSET_INSPECTION, ASSET_ACCESS, ASSET_VALUES],
      useFactory: (repo: IAssetRepository, storage: IAssetStoragePort, inspection: IAssetInspectionPort,
        access: IAssetAccessPort, values: IAssetValuesPort) =>
        new UploadAssetUseCase(repo, storage, inspection, access, values),
    },
  ];
}
