import type { Asset } from '../../../domain/media/asset.js';

export interface IAssetRepository {
  findVersion(siteId: string, assetId: string, assetVersion: string): Promise<Asset | null>;
  create(asset: Asset): Promise<void>;
  /** Compare the metadata version; never overwrite an existing ready asset version. */
  commitProcessing(asset: Asset, expectedVersion: string): Promise<void>;
}
