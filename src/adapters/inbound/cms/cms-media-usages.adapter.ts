import type { ICmsFileUsages } from '../../../ports/inbound/cms/cms-file-usages.port.js';
import type { IFileLibraryOperations, ILibraryFile } from '../../../ports/inbound/media/file-library.port.js';
import { adminMediaUsage } from '../shared/admin-media-usage.dto.js';

export class CmsMediaUsagesAdapter implements ICmsFileUsages {
  constructor(private readonly usages: IFileLibraryOperations['usages']) {}

  async execute(input: ILibraryFile): ReturnType<ICmsFileUsages['execute']> {
    const review = await this.usages.execute(input);

    return { version: review.version, usages: review.usages.map((usage) => adminMediaUsage(input.siteId, usage)) };
  }
}
