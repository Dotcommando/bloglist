import type { AssetVisibility } from '../../../domain/media/asset.js';
import type { IAssetUploadReceipt } from '../../../domain/media/asset-upload-receipt.js';
import type { ImageUploadMode } from '../../../domain/media/image-upload-mode.enum.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IUploadAssetInput {
  readonly mode?: ImageUploadMode;

  readonly siteId: string;
  readonly actorId: string;
  readonly filename: string;
  readonly visibility: AssetVisibility;
  readonly content: IBinaryContent;
}

export interface IUploadAsset {
  execute(input: IUploadAssetInput): Promise<IAssetUploadReceipt>;
}
