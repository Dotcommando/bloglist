import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { MediaRoot, validateMediaName } from '../../../domain/media/file-library.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class CreateMediaFolderUseCase {
  constructor(private readonly library: FileLibraryService) {}

  async execute(input: Parameters<IFileLibraryOperations['createFolder']['execute']>[0]): Promise<IMediaLibraryView> {
    const previous = await this.library.read(input);

    validateMediaName(input.name, true);

    return this.library.save(previous, {
      ...previous,
      folders: [...previous.folders, {
        folderId: this.library.values.nextId(),
        parentId: input.parentId,
        name: input.name,
        root: input.root ?? previous.folders.find((folder) => folder.folderId === input.parentId)?.root
          ?? MediaRoot.Images,
      }],
    });
  }
}
