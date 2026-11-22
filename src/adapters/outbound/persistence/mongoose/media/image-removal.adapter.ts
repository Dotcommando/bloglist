import type { Model } from 'mongoose';

import type { IAssetState } from '../../../../../domain/media/asset.js';
import type { IAssetStoragePort } from '../../../../../ports/outbound/media/asset-storage.port.js';
import type { IMediaImageRemoval } from '../../../../../ports/outbound/media/file-library.port.js';
import type { IAssetRecord } from './asset.repository.js';

export class MediaImageRemovalAdapter implements IMediaImageRemoval {
  constructor(private readonly assets: Model<IAssetRecord>, private readonly storage: IAssetStoragePort) {}

  async remove(image: IAssetState): Promise<void> {
    const references = [image.original, ...image.variants.map((variant) => variant.content),
      ...(image.file ? [image.file] : [])];

    for (const reference of new Map(references.map((item) => [item.contentId, item])).values()) {
      await this.storage.assertOwned(image.siteId, image.assetId, image.assetVersion, reference);
      await this.storage.delete(image.siteId, reference);
    }
    await this.assets.deleteOne({ _id: image.assetVersion, siteId: image.siteId, assetId: image.assetId }).exec();
  }
}
