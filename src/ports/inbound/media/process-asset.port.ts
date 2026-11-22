import type { Asset } from '../../../domain/media/asset.js';

export interface IProcessAssetInput {

  readonly siteId: string;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly expectedVersion: string;
}

export interface IProcessAsset {
  execute(input: IProcessAssetInput): Promise<Asset>;
}
