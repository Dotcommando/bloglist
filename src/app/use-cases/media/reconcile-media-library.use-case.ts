import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import type { ILibraryScope } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';
import { ListMediaFilesUseCase } from './list-media-files.use-case.js';

export class ReconcileMediaLibraryUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: ILibraryScope): Promise<IMediaLibraryView> {
    await this.library.access.requireEditor(input.siteId);
    await this.library.store.reconcile(input.siteId);

    return new ListMediaFilesUseCase(this.library.store, this.library.access, this.library.values).execute(input);
  }
}
