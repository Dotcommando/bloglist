import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  LocalPublicationAccessAdapter,
} from '../../adapters/outbound/access/local/publication/local-publication-access.adapter.js';
import { LocalSiteAccessAdapter } from '../../adapters/outbound/access/local/sites/local-site-access.adapter.js';
import {
  CloudflareDeploymentAdapter, type ICloudflareDeploymentSettings,
} from '../../adapters/outbound/deployment/cloudflare/cloudflare-deployment.adapter.js';
import { bundleCloudflareWorker } from '../../adapters/outbound/deployment/cloudflare/worker-bundle.js';
import { assetModel } from '../../adapters/outbound/persistence/mongoose/media/asset.repository.js';
import {
  mediaLibraryModel, MongooseFileLibraryStore,
} from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { MediaImageRemovalAdapter } from '../../adapters/outbound/persistence/mongoose/media/image-removal.adapter.js';
import { publicationModels } from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  MongooseReleaseActivationAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/release-activation.adapter.js';
import { MongooseSiteRepository } from '../../adapters/outbound/persistence/mongoose/sites/site.repository.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { FilePublicationStoreAdapter } from '../../adapters/outbound/publication/files/publication-store.adapter.js';
import { FileAssetStorageAdapter } from '../../adapters/outbound/storage/files/media/asset-storage.adapter.js';
import {
  FileLibraryProjectionAdapter,
} from '../../adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { MediaLibraryReaderService } from '../../app/services/media/media-library-reader.service.js';
import { ListMediaFilesUseCase } from '../../app/use-cases/media/list-media-files.use-case.js';
import { ReadMediaContentUseCase } from '../../app/use-cases/media/read-media-content.use-case.js';
import { PrepareSiteDeploymentUseCase } from '../../app/use-cases/publication/prepare-site-deployment.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import type { IFileLibraryOperations } from '../../ports/inbound/media/file-library.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IPublicationAccessPort } from '../../ports/outbound/publication/publication-access.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ISiteDeploymentOutputPort } from '../../ports/outbound/publication/site-deployment-output.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../ports/outbound/sites/site-access.port.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { PUBLICATION_ACCESS, PUBLICATION_STORE, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { GET_SITE, SITE_ACCESS, SITE_REPOSITORY } from '../sites/sites.tokens.js';
import {
  DEPLOYMENT_MEDIA_READS, DEPLOYMENT_WORKER_SOURCE, PREPARE_SITE_DEPLOYMENT, SITE_DEPLOYMENT_OUTPUT,
} from './deployment.tokens.js';

/** Read-only composition: no business add-on runtime or hook-dispatch lifecycle is started. */
export function deploymentProviders(
  settings: ILocalApplicationSettings, target: ICloudflareDeploymentSettings,
): Provider[] {
  return [
    {
      provide: SITE_REPOSITORY,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseSiteRepository(
        connection.model<ISiteRecord>('Site', siteSchema), () => new Date()),
    },
    { provide: SITE_ACCESS, useFactory: () => new LocalSiteAccessAdapter(settings.operator) },
    {
      provide: GET_SITE,
      inject: [SITE_REPOSITORY, SITE_ACCESS],
      useFactory: (sites: ISiteRepository, access: ISiteAccessPort) => new GetSiteUseCase(sites, access),
    },
    { provide: PUBLICATION_ACCESS, useFactory: () => new LocalPublicationAccessAdapter(settings.operator) },
    {
      provide: PUBLICATION_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new FilePublicationStoreAdapter(
        settings.rendering?.artifactsRoot ?? path.resolve('artifacts'), publicationModels(connection).releases,
        new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: RELEASE_ACTIVATION,
      inject: [MONGO_CONNECTION, PUBLICATION_STORE],
      useFactory: (connection: Connection, store: IPublicationStorePort) =>
        new MongooseReleaseActivationAdapter(publicationModels(connection), store),
    },
    {
      provide: DEPLOYMENT_MEDIA_READS,
      inject: [MONGO_CONNECTION, GET_SITE, PUBLICATION_ACCESS],
      useFactory: (connection: Connection, sites: IGetSite, access: IPublicationAccessPort):
      Pick<IFileLibraryOperations, 'list' | 'readContent'> | null => {
        if (!settings.media) {
          return null;
        }

        const media = settings.media;
        const scope = new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema));
        const storage = new FileAssetStorageAdapter(media.root, media.publicBaseUrl, scope);
        const projection = new FileLibraryProjectionAdapter(media.root, storage, scope);
        const store = new MongooseFileLibraryStore(mediaLibraryModel(connection), projection,
          new MediaImageRemovalAdapter(assetModel(connection), storage));
        const libraryAccess = {
          actorId: async () => settings.operator.operatorId,
          requireEditor: async (siteId: string): Promise<void> => {
            await access.assertEditor(siteId, settings.operator.operatorId);

            if (!await sites.execute({ siteId })) {
              throw new Error('Media site not found');
            }
          },
        };
        const reader = new MediaLibraryReaderService(store, libraryAccess);

        return {
          list: new ListMediaFilesUseCase(store, libraryAccess, {
            nextId: randomUUID,
            publicPath: media.publicBaseUrl,
          }),
          readContent: new ReadMediaContentUseCase(reader, storage),
        };
      },
    },
    {
      provide: DEPLOYMENT_WORKER_SOURCE,
      useFactory: async () => bundleCloudflareWorker(
        new URL('../../adapters/inbound/gateway/cloudflare/worker.js', import.meta.url)),
    },
    {
      provide: SITE_DEPLOYMENT_OUTPUT,
      inject: [DEPLOYMENT_WORKER_SOURCE],
      useFactory: (source: string) => new CloudflareDeploymentAdapter(target, source),
    },
    {
      provide: PREPARE_SITE_DEPLOYMENT,
      inject: [
        PUBLICATION_ACCESS, GET_SITE, RELEASE_ACTIVATION, PUBLICATION_STORE,
        DEPLOYMENT_MEDIA_READS, SITE_DEPLOYMENT_OUTPUT,
      ],
      useFactory: (access: IPublicationAccessPort, sites: IGetSite, activation: IReleaseActivationPort,
        store: IPublicationStorePort & IPublicationArtifactSourcePort,
        media: Pick<IFileLibraryOperations, 'list' | 'readContent'> | null, output: ISiteDeploymentOutputPort) =>
        new PrepareSiteDeploymentUseCase(access, sites, activation, store, store, media, output),
    },
  ];
}
