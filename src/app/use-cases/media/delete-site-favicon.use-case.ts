import type { IDeleteSiteFavicon } from '../../../ports/inbound/media/site-favicon.port.js';
import type {
  IApplyPublishedMediaAddresses,
} from '../../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IMediaLibraryAccess } from '../../../ports/outbound/media/file-library.port.js';
import type { ISiteFaviconStore } from '../../../ports/outbound/media/site-favicon-store.port.js';

export class DeleteSiteFaviconUseCase implements IDeleteSiteFavicon {
  constructor(private readonly store: Pick<ISiteFaviconStore, 'remove'>,
    private readonly access: Pick<IMediaLibraryAccess, 'requireEditor'>,
    private readonly publication: IApplyPublishedMediaAddresses) {}

  async execute(input: Parameters<IDeleteSiteFavicon['execute']>[0]): Promise<void> {
    await this.access.requireEditor(input.siteId);
    await this.store.remove(input.siteId);
    await this.publication.execute({ siteId: input.siteId, paths: [], favicon: null });
  }
}
