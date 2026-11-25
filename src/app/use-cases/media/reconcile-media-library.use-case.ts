import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import type { ILibraryScope } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class ReconcileMediaLibraryUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: ILibraryScope): Promise<IMediaLibraryView> {
    await this.library.access.requireEditor(input.siteId);
    await this.library.store.reconcile(input.siteId);

    return { ...await this.library.store.status(input.siteId), files: [], folders: [] };
  }
}
