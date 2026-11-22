import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class DeleteMediaFileUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: Parameters<IFileLibraryOperations['delete']['execute']>[0]): Promise<IMediaLibraryView> {
    // Force delete deliberately bypasses usage/review checks; retain normal site authorization.
    const previous = await this.library.read(input.force ? { siteId: input.siteId } : input);
    const file = this.library.file(previous, input.fileId);

    if (
      !input.force
      && (await this.library.usages.find(input.siteId, this.library.paths(previous, file), file.fileId)).length
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Image is in use');
    }

    return this.library.save(previous, {
      ...previous,
      files: previous.files.filter((item) => item.fileId !== file.fileId),
    });
  }
}
