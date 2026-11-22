import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { IAssetStoragePort } from '../../../ports/outbound/media/asset-storage.port.js';
import type { MediaLibraryReaderService } from '../../services/media/media-library-reader.service.js';

export class ReadMediaContentUseCase {
  constructor(private readonly library: MediaLibraryReaderService, private readonly storage: IAssetStoragePort) {}

  async execute(
    input: Parameters<IFileLibraryOperations['readContent']['execute']>[0],
  ): ReturnType<IFileLibraryOperations['readContent']['execute']> {
    const current = await this.library.read(input);
    const file = this.library.file(current, input.fileId);
    const contentId = input.key === 'original' ? file.image.original.contentId
      : file.outputs.find((output) => output.key === input.key)?.contentId;

    if (!contentId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Image output not found');
    }
    await this.storage.assertOwned(input.siteId, file.image.assetId, file.image.assetVersion, { contentId });
    const content = await this.storage.read(input.siteId, { contentId });

    if (!content) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Image bytes not found');
    }

    return { content, filename: file.name };
  }
}
