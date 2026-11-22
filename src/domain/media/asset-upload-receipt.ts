import type { AssetProcessingState } from './asset.js';

export interface IAssetUploadReceipt {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly state: AssetProcessingState.Processing;
}
