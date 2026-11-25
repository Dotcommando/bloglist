import { FileLibraryService } from '../../app/services/media/file-library.service.js';
import { PrepareLibraryImageService } from '../../app/services/media/prepare-library-image.service.js';
import { BrowseMediaFolderUseCase } from '../../app/use-cases/media/browse-media-folder.use-case.js';
import { ChangeMediaImageUseCase } from '../../app/use-cases/media/change-media-image.use-case.js';
import { CreateMediaFolderUseCase } from '../../app/use-cases/media/create-media-folder.use-case.js';
import { DeleteMediaFileUseCase } from '../../app/use-cases/media/delete-media-file.use-case.js';
import { GetAssetUseCase } from '../../app/use-cases/media/get-asset.use-case.js';
import { GetMediaUsagesUseCase } from '../../app/use-cases/media/get-media-usages.use-case.js';
import { ListMediaFilesUseCase } from '../../app/use-cases/media/list-media-files.use-case.js';
import { MoveMediaFileUseCase } from '../../app/use-cases/media/move-media-file.use-case.js';
import { ProcessAssetUseCase } from '../../app/use-cases/media/process-asset.use-case.js';
import { ReadMediaContentUseCase } from '../../app/use-cases/media/read-media-content.use-case.js';
import { ReconcileMediaLibraryUseCase } from '../../app/use-cases/media/reconcile-media-library.use-case.js';
import { UploadAssetUseCase } from '../../app/use-cases/media/upload-asset.use-case.js';
import { UploadMediaFileUseCase } from '../../app/use-cases/media/upload-media-file.use-case.js';
import type { IFileLibraryOperations } from '../../ports/inbound/media/file-library.port.js';
import type {
  IApplyPublishedMediaAddresses,
} from '../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IAssetRepository } from '../../ports/outbound/media/asset.repository.js';
import type { IAssetAccessPort } from '../../ports/outbound/media/asset-access.port.js';
import type { IAssetInspectionPort } from '../../ports/outbound/media/asset-inspection.port.js';
import type { IAssetStoragePort } from '../../ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../ports/outbound/media/asset-values.port.js';
import type {
  IMediaLibraryAccess,
  IMediaLibraryStore,
  IMediaLibraryValues,
  IMediaUsages,
} from '../../ports/outbound/media/file-library.port.js';
import type { IImageProcessingPort } from '../../ports/outbound/media/image-processing.port.js';
import type { IMediaReferenceUpdates } from '../../ports/outbound/media/media-reference-updates.port.js';

export function fileLibraryOperations(
  store: IMediaLibraryStore,
  access: IMediaLibraryAccess & IAssetAccessPort,
  values: IMediaLibraryValues,
  usages: IMediaUsages,
  repository: IAssetRepository,
  storage: IAssetStoragePort,
  inspection: IAssetInspectionPort,
  images: IImageProcessingPort,
  assetValues: IAssetValuesPort,
  references?: IMediaReferenceUpdates,
  publication?: IApplyPublishedMediaAddresses,
): IFileLibraryOperations {
  const library = new FileLibraryService(store, access, values, usages, () => assetValues.now());
  const upload = new UploadAssetUseCase(repository, storage, inspection, access, assetValues);
  const get = new GetAssetUseCase(repository, access, storage);
  const process = new ProcessAssetUseCase(repository, storage, images, access, assetValues);
  const preparation = new PrepareLibraryImageService(upload, get, process, access, store);

  return {
    list: new ListMediaFilesUseCase(store, access, values),
    browse: new BrowseMediaFolderUseCase(store, access, values),
    createFolder: new CreateMediaFolderUseCase(library),
    upload: new UploadMediaFileUseCase(library, preparation),
    changeImage: new ChangeMediaImageUseCase(library, preparation),
    move: new MoveMediaFileUseCase(library, references, publication),
    delete: new DeleteMediaFileUseCase(library),
    usages: new GetMediaUsagesUseCase(library),
    reconcile: new ReconcileMediaLibraryUseCase(library),
    readContent: new ReadMediaContentUseCase(library, storage),
  };
}
