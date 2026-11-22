import { DeleteSiteFaviconUseCase } from '../../app/use-cases/media/delete-site-favicon.use-case.js';
import { GetSiteFaviconUseCase } from '../../app/use-cases/media/get-site-favicon.use-case.js';
import { UploadSiteFaviconUseCase } from '../../app/use-cases/media/upload-site-favicon.use-case.js';
import type { ISiteFaviconOperations } from '../../ports/inbound/media/site-favicon.port.js';
import type {
  IApplyPublishedMediaAddresses,
} from '../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IAssetInspectionPort } from '../../ports/outbound/media/asset-inspection.port.js';
import type { IMediaLibraryAccess } from '../../ports/outbound/media/file-library.port.js';
import type { ISiteFaviconStore } from '../../ports/outbound/media/site-favicon-store.port.js';

export function siteFaviconOperations(store: ISiteFaviconStore,
  access: Pick<IMediaLibraryAccess, 'requireEditor'>, inspection: IAssetInspectionPort,
  publication: IApplyPublishedMediaAddresses): ISiteFaviconOperations {
  return {
    get: new GetSiteFaviconUseCase(store, access),
    upload: new UploadSiteFaviconUseCase(store, access, inspection, publication),
    delete: new DeleteSiteFaviconUseCase(store, access, publication),
  };
}
