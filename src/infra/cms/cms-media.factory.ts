import { createHash, randomUUID } from 'node:crypto';

import type { ModuleRef } from '@nestjs/core';
import type { Connection } from 'mongoose';

import { CmsMediaUsagesAdapter } from '../../adapters/inbound/cms/cms-media-usages.adapter.js';
import type { CmsContextAccessAdapter } from '../../adapters/outbound/access/cms/cms-context-access.adapter.js';
import {
  MediaUsagesAdapter,
} from '../../adapters/outbound/media/references/media-usages.adapter.js';
import {
  AssetInspectionAdapter,
} from '../../adapters/outbound/media/sharp/asset-inspection.adapter.js';
import {
  SharpImageProcessingAdapter,
} from '../../adapters/outbound/media/sharp/image-processing.adapter.js';
import {
  assetModel,
  MongooseAssetRepository,
} from '../../adapters/outbound/persistence/mongoose/media/asset.repository.js';
import {
  mediaLibraryModel,
  MongooseFileLibraryStore,
} from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import {
  MediaImageRemovalAdapter,
} from '../../adapters/outbound/persistence/mongoose/media/image-removal.adapter.js';
import {
  type IPageRecord,
  pageSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  PageMediaReferencesAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-media-references.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import {
  PublicationMediaReferencesAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/media-references.adapter.js';
import {
  publicationModels,
} from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  type ISiteRecord,
  siteSchema,
} from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import {
  RenderingMediaReferencesAdapter,
} from '../../adapters/outbound/rendering/modx/media-references.adapter.js';
import {
  FileAssetStorageAdapter,
} from '../../adapters/outbound/storage/files/media/asset-storage.adapter.js';
import {
  FileLibraryProjectionAdapter,
} from '../../adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { PrepareLibraryImageService } from '../../app/services/media/prepare-library-image.service.js';
import { ProgrammaticFilesService } from '../../app/services/media/programmatic-files.service.js';
import { GetAssetUseCase } from '../../app/use-cases/media/get-asset.use-case.js';
import { ProcessAssetUseCase } from '../../app/use-cases/media/process-asset.use-case.js';
import { UploadAssetUseCase } from '../../app/use-cases/media/upload-asset.use-case.js';
import { fileRequirement } from '../../domain/media/file-library.js';
import type { ICmsCoreOperations } from '../../ports/inbound/cms/cms-api.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import { addonFileReferences } from '../media/addon-file-references.factory.js';
import { fileLibraryOperations } from '../media/file-library-operations.factory.js';

export function cmsMediaOperations(media: { readonly root: string; readonly publicBaseUrl: string } | undefined,
  connection: Connection, access: CmsContextAccessAdapter, sources: IRenderingSourcePort,
  publications: IPublicationArtifactSourcePort, ref: ModuleRef): ICmsCoreOperations['files'] {
  if (!media) {
    const unavailable = {
      execute: async (): Promise<never> => {
        throw new Error('CMS media storage is not configured');
      },
    };

    return {
      list: unavailable,
      browse: { ...unavailable, file: unavailable.execute },
      getFile: unavailable,
      getFiles: unavailable,
      ensureFolder: unavailable,
      uploadFile: unavailable,
      uploadBatch: unavailable,
      createFolder: unavailable,
      upload: unavailable,
      changeImage: unavailable,
      move: unavailable,
      usages: unavailable,
      delete: unavailable,
      reconcile: unavailable,
      readContent: unavailable,
      getAsset: unavailable,
      uploadAsset: unavailable,
      processAsset: unavailable,
    };
  }

  const scope = new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema));
  const storage = new FileAssetStorageAdapter(media.root, media.publicBaseUrl, scope);
  const model = assetModel(connection);
  const assets = new MongooseAssetRepository(model);
  const projection = new FileLibraryProjectionAdapter(media.root, storage, scope);
  const addonReferences = addonFileReferences(connection, ref);
  const store = new MongooseFileLibraryStore(mediaLibraryModel(connection), projection,
    new MediaImageRemovalAdapter(model, storage), addonReferences);
  const inspection = new AssetInspectionAdapter();
  const images = new SharpImageProcessingAdapter();
  const values = {
    nextId: randomUUID,
    nextAssetVersion: randomUUID,
    nextMetadataVersion: randomUUID,
    now: () => new Date(),
  };
  const usages = new MediaUsagesAdapter([
    new PageMediaReferencesAdapter(connection.model<IPageRecord>('Page', pageSchema),
      connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema)),
    new RenderingMediaReferencesAdapter(sources),
    new PublicationMediaReferencesAdapter(publicationModels(connection).releases, publications),
  ], addonReferences);
  const operations = fileLibraryOperations(store, access, { nextId: randomUUID, publicPath: media.publicBaseUrl },
    usages, assets, storage, inspection, images, values);
  const get = new GetAssetUseCase(assets, access, storage);
  const upload = new UploadAssetUseCase(assets, storage, inspection, access, values);
  const process = new ProcessAssetUseCase(assets, storage, images, access, values);
  const fileValues = { nextId: randomUUID, publicPath: media.publicBaseUrl };
  const programmatic = new ProgrammaticFilesService(store, access, fileValues,
    new PrepareLibraryImageService(upload, get, process, access, store),
    (siteId, actorId, key) => createHash('sha256').update(JSON.stringify([siteId, actorId, key])).digest('hex'));

  return {
    ...operations,
    ensureFolder: { execute: (input) => programmatic.ensureFolder(input) },
    uploadFile: { execute: (input) => programmatic.uploadFile(input) },
    uploadBatch: { execute: (input) => programmatic.uploadBatch(input) },
    getFile: { execute: (input) => operations.browse.file(input) },
    getFiles: {
      execute: async ({ siteId, fileIds }) => {
        await access.requireEditor(siteId);
        fileRequirement(Array.isArray(fileIds) && fileIds.length <= 100 && fileIds.every((id) =>
          typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)), 'Invalid media file identities');

        return store.metadata(siteId, fileIds, media.publicBaseUrl);
      },
    },
    usages: new CmsMediaUsagesAdapter(operations.usages),
    getAsset: get,
    uploadAsset: upload,
    processAsset: process,
  };
}
