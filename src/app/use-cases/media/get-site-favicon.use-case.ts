import type { ISiteFavicon } from '../../../domain/media/site-favicon.js';
import type { IGetSiteFavicon } from '../../../ports/inbound/media/site-favicon.port.js';
import type { IMediaLibraryAccess } from '../../../ports/outbound/media/file-library.port.js';
import type { ISiteFaviconStore } from '../../../ports/outbound/media/site-favicon-store.port.js';

export class GetSiteFaviconUseCase implements IGetSiteFavicon {
  constructor(private readonly store: ISiteFaviconStore,
    private readonly access: Pick<IMediaLibraryAccess, 'requireEditor'>) {}

  async execute(input: { readonly siteId: string }): Promise<ISiteFavicon | null> {
    await this.access.requireEditor(input.siteId);
    const icon = await this.store.read(input.siteId);

    if (!icon) {
      return null;
    }

    try {
      return { byteSize: icon.byteSize, width: icon.width, height: icon.height, version: icon.version };
    } finally {
      await icon.dispose();
    }
  }
}
