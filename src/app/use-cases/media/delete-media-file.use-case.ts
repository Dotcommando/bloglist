import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class DeleteMediaFileUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: Parameters<IFileLibraryOperations['delete']['execute']>[0]): Promise<IMediaLibraryView> {
    // Force delete deliberately bypasses usage/review checks; retain normal site authorization.
    const expected = input.force ? undefined : input.expectedVersion;
    const previous = await this.library.entry(input.siteId, input.fileId, expected,
      input.force ? undefined : input.expectedFileVersion);

    if (
      !input.force
      && (await this.library.usages.find(input.siteId, this.library.paths(previous), input.fileId)).length
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Image is in use');
    }

    return this.library.saveFile(input.siteId, previous, null, input.force);
  }
}
