import { SITE_FAVICON_PATH } from '../../../domain/media/site-favicon.js';
import type { IPublicMediaContent, IReadPublicMedia } from '../../../ports/inbound/media/read-public-media.port.js';
import type { IResolveSite } from '../../../ports/inbound/sites/resolve-site.port.js';
import type { IAssetStoragePort } from '../../../ports/outbound/media/asset-storage.port.js';
import type { IMediaLibraryStore } from '../../../ports/outbound/media/file-library.port.js';
import type { ISiteFaviconStore } from '../../../ports/outbound/media/site-favicon-store.port.js';

export class ReadPublicMediaUseCase implements IReadPublicMedia {
  constructor(private readonly sites: IResolveSite, private readonly libraries: IMediaLibraryStore,
    private readonly storage: IAssetStoragePort, private readonly publicPath: string,
    private readonly favicons: ISiteFaviconStore) {}

  async execute(input: Parameters<IReadPublicMedia['execute']>[0]): Promise<IPublicMediaContent | null> {
    const site = await this.sites.execute({
      hostname: input.hostname,
      ...(input.authority === undefined ? {} : { authority: input.authority }),
    });

    if (!site) {
      return null;
    }
    if (input.path === SITE_FAVICON_PATH) {
      const icon = await this.favicons.read(site.siteId);

      return icon ? { content: icon.content, etag: '"' + icon.version + '"', dispose: () => icon.dispose() } : null;
    }
    if (!input.path.startsWith(this.publicPath + '/')) {
      return null;
    }

    const path = input.path.slice(this.publicPath.length + 1);
    let last: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.libraries.publicOutput(site.siteId, path);

      if (!result || last === result.output.contentId) {
        return null;
      }

      const { image, output } = result;
      const reference = { contentId: output.contentId };
      const etag = '"' + image.assetVersion + '-' + output.key + '"';

      await this.storage.assertOwned(site.siteId, image.assetId, image.assetVersion, reference);

      if (this.storage.readPinned) {
        const file = await this.storage.readPinned(site.siteId, reference);

        if (file) {
          return { ...file, etag };
        }
      } else {
        const content = await this.storage.read(site.siteId, reference);

        if (content) {
          return { content, etag };
        }
      }
      last = output.contentId;
    }

    return null;
  }
}
