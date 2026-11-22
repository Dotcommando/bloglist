import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { IImageProfile } from '../../../../domain/media/image-profile.js';
import { responsiveWidth } from '../../../../domain/media/image-profile.js';
import { DEFAULT_IMAGE_QUALITY, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../../../../domain/media/media-policy.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import type {
  IImageProcessingPort, IImageProcessingResult, IProcessedImageVariant,
} from '../../../../ports/outbound/media/image-processing.port.js';
import { digestFile, fileContent, stageFile } from '../../storage/files/binary-file.js';
import sharp from './sharp-file-runtime.js';

export class SharpImageProcessingAdapter implements IImageProcessingPort {
  async process(content: IBinaryContent, profileVersion: string,
    profiles: readonly IImageProfile[]): Promise<IImageProcessingResult> {
    const input = await stageFile(content, MAX_IMAGE_BYTES);
    const directory = input.filename + '-variants';
    const dispose = input.dispose;

    try {
      await mkdir(directory);
      const normalized = path.join(directory, 'normalized.tiff');
      const info = await sharp(input.filename, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
        .rotate().tiff({ compression: 'lzw' }).toFile(normalized);
      const { width, height } = info;
      const variants: IProcessedImageVariant[] = [];
      const mappings = [];

      for (const profile of profiles) {
        const target = responsiveWidth(width, profile.targetWidth);
        const variantId = 'w' + target;

        if (!variants.some((variant) => variant.variantId === variantId)) {
          const filename = path.join(directory, variantId + '.webp');
          const output = await sharp(normalized, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
            .resize({ width: target, withoutEnlargement: true }).webp({ quality: DEFAULT_IMAGE_QUALITY })
            .toFile(filename);
          const digest = await digestFile(filename);

          variants.push({
            variantId,
            content: fileContent(filename, digest.byteSize, 'image/webp'),
            checksum: digest.checksum,
            dimensions: {
              width: output.width, height: output.height, aspectRatio: output.width / output.height,
            },
          });
        }
        mappings.push({ profileId: profile.profileId, variantIds: [variantId] });
      }

      return {
        originalDimensions: { width, height, aspectRatio: width / height },
        profileVersion,
        variants,
        profileMappings: mappings,
        dispose,
      };
    } catch (error) {
      await dispose();
      throw error;
    }
  }
}
