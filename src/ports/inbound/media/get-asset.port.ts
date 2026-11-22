import type { Asset } from '../../../domain/media/asset.js';

export interface IGetAssetInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly assetId: string;
  readonly assetVersion: string;
}

export interface IGetAsset {
  execute(input: IGetAssetInput): Promise<Asset | null>;
}
