import type { ILibraryFile, ILibraryReview } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class GetMediaUsagesUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: ILibraryFile): Promise<ILibraryReview> {
    const current = await this.library.entry(
      input.siteId, input.fileId, input.expectedVersion, input.expectedFileVersion,
    );
    const usages = await this.library.usages.find(input.siteId, this.library.paths(current), current.file.fileId);

    return { version: current.version, usages };
  }
}
