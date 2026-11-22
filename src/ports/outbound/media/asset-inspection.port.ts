import type { IImageDimensions } from '../../../domain/media/asset.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IInspectedAsset {
  readonly dimensions?: IImageDimensions;
  readonly content: IBinaryContent;
  readonly checksum: string;
  /** Release temporary resources after consuming content, including on failure. */
  dispose?(): Promise<void>;
}

export interface IAssetInspectionPort {
  inspect(filename: string, content: IBinaryContent): Promise<IInspectedAsset>;
}
