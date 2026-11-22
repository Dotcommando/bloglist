import type { ILibraryFile, ILibraryReview } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class GetMediaUsagesUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: ILibraryFile): Promise<ILibraryReview> {
    const current = await this.library.read(input);
    const file = this.library.file(current, input.fileId);
    const usages = await this.library.usages.find(input.siteId, this.library.paths(current, file), file.fileId);

    return { version: current.version, usages };
  }
}
