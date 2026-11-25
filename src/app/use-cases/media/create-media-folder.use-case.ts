import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { MediaRoot, validateMediaName } from '../../../domain/media/file-library.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class CreateMediaFolderUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: Parameters<IFileLibraryOperations['createFolder']['execute']>[0]): Promise<IMediaLibraryView> {
    const expectedVersion = await this.library.current(input.siteId, input.expectedVersion);

    validateMediaName(input.name, true);

    const parent = input.parentId === null ? null : await this.library.store.folder(input.siteId, input.parentId);
    const version = this.library.values.nextId();
    const folder = await this.library.store.ensureFolder(input.siteId, {
      folderId: this.library.values.nextId(),
      parentId: input.parentId,
      name: input.name,
      root: input.root ?? parent?.root ?? MediaRoot.Images,
    }, version, expectedVersion);

    return { version, folders: [folder], files: [], pending: false };
  }
}
