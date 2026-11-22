import type { IImageDimensions, IImageProfileMapping } from '../../../domain/media/asset.js';
import type { IImageProfile } from '../../../domain/media/image-profile.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IProcessedImageVariant {
  readonly variantId: string;
  readonly content: IBinaryContent;
  readonly dimensions: IImageDimensions;
  readonly checksum: string;
}

export interface IImageProcessingResult {
  readonly originalDimensions: IImageDimensions;
  readonly profileVersion: string;
  readonly variants: readonly IProcessedImageVariant[];
  readonly profileMappings: readonly IImageProfileMapping[];
  /** Release all temporary derivative resources, including unconsumed variants. */
  dispose?(): Promise<void>;
}

export interface IImageProcessingPort {
  process(content: IBinaryContent, profileVersion: string,
    profiles: readonly IImageProfile[]): Promise<IImageProcessingResult>;
}
