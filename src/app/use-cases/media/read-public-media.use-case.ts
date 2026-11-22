import { mediaPath, mediaRoot } from '../../../domain/media/file-library.js';
import { SITE_FAVICON_PATH } from '../../../domain/media/site-favicon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
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

    const { library, pending } = await this.libraries.read(site.siteId);

    if (pending) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Media update is pending');
    }

    for (const file of library.files) {
      const output = file.outputs.find((output) => this.publicPath + '/' + mediaRoot(file) + '/'
        + mediaPath(library, file, output.suffix) === input.path);

      if (output) {
        const reference = { contentId: output.contentId };

        await this.storage.assertOwned(site.siteId, file.image.assetId, file.image.assetVersion, reference);
        const content = await this.storage.read(site.siteId, reference);

        return content ? { content, etag: '"' + file.image.assetVersion + '-' + output.key + '"' } : null;
      }
    }

    return null;
  }
}
