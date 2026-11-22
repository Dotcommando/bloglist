import { AssetVisibility } from '../../../domain/media/asset.js';
import { fileRequirement, type ImageUploadMode, type IMediaFile } from '../../../domain/media/file-library.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import type { IGetAsset } from '../../../ports/inbound/media/get-asset.port.js';
import type { IProcessAsset } from '../../../ports/inbound/media/process-asset.port.js';
import type { IUploadAsset } from '../../../ports/inbound/media/upload-asset.port.js';
import type { IMediaLibraryAccess } from '../../../ports/outbound/media/file-library.port.js';

/** Shared upload/replace preparation using the existing private, awaited media pipeline. */
export class PrepareLibraryImageService {
  constructor(private readonly upload: IUploadAsset, private readonly get: IGetAsset,
    private readonly process: IProcessAsset, private readonly access: IMediaLibraryAccess) {}

  async prepare(input: { readonly siteId: string;
    readonly filename: string;
    readonly mode: ImageUploadMode;
    readonly content: IBinaryContent }): Promise<Pick<IMediaFile, 'image' | 'outputs'>> {
    const actorId = await this.access.actorId();
    const receipt = await this.upload.execute({ ...input, actorId, visibility: AssetVisibility.Private });
    const asset = await this.get.execute({ siteId: input.siteId, actorId, ...receipt });

    fileRequirement(asset !== null, 'Uploaded image is unavailable');
    const processed = await this.process.execute({
      ...receipt, siteId: input.siteId, expectedVersion: asset.toState().version,
    });
    const image = processed.toState();

    fileRequirement(!image.mimeType.startsWith('image/') || image.originalDimensions, 'Image has no usable dimensions');
    const outputs = image.file ? [{
      key: 'file',
      suffix: '',
      contentId: image.file.contentId,
      mimeType: image.mimeType,
      dimensions: image.originalDimensions,
    }]
      : image.profileMappings.map((mapping) => {
        const variant = image.variants.find((item) => item.variantId === mapping.variantIds[0]);

        fileRequirement(variant, 'Missing prepared image profile');

        return {
          key: mapping.profileId,
          suffix: '--' + mapping.profileId + '.webp',
          contentId: variant.content.contentId,
          mimeType: variant.mimeType,
          dimensions: variant.dimensions,
        };
      });

    return { image, outputs };
  }
}
