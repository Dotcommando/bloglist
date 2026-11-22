import { MediaValidationError, MediaValidationIssue } from '../../../domain/media/media-validation.error.js';
import { type ISiteFavicon, SITE_FAVICON_MIME_TYPE } from '../../../domain/media/site-favicon.js';
import type { IUploadSiteFavicon } from '../../../ports/inbound/media/site-favicon.port.js';
import type {
  IApplyPublishedMediaAddresses,
} from '../../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IAssetInspectionPort } from '../../../ports/outbound/media/asset-inspection.port.js';
import type { IMediaLibraryAccess } from '../../../ports/outbound/media/file-library.port.js';
import type { ISiteFaviconStore } from '../../../ports/outbound/media/site-favicon-store.port.js';

export class UploadSiteFaviconUseCase implements IUploadSiteFavicon {
  constructor(private readonly store: ISiteFaviconStore,
    private readonly access: Pick<IMediaLibraryAccess, 'requireEditor'>,
    private readonly inspection: IAssetInspectionPort,
    private readonly publication: IApplyPublishedMediaAddresses) {}

  async execute(input: Parameters<IUploadSiteFavicon['execute']>[0]): Promise<ISiteFavicon> {
    await this.access.requireEditor(input.siteId);

    if (!input.filename.toLowerCase().endsWith('.ico')) {
      throw new MediaValidationError(MediaValidationIssue.UnsupportedFormat);
    }

    const inspected = await this.inspection.inspect(input.filename, input.content);

    try {
      if (inspected.content.mimeType !== SITE_FAVICON_MIME_TYPE || !inspected.dimensions) {
        throw new MediaValidationError(MediaValidationIssue.ContentMismatch);
      }

      const icon = await this.store.replace(input.siteId, inspected.content, inspected.dimensions);

      await this.publication.execute({ siteId: input.siteId, paths: [], favicon: icon });

      return icon;
    } finally {
      await inspected.dispose?.();
    }
  }
}
