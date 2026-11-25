import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import {
  fileRequirement, ImageUploadMode, mediaFilenameRoot, validateMediaName,
} from '../../../domain/media/file-library.js';
import type { ILibraryUpload } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';
import type { PrepareLibraryImageService } from '../../services/media/prepare-library-image.service.js';

export class UploadMediaFileUseCase {
  constructor(private readonly library: FileLibraryService,
    private readonly prepare: Pick<PrepareLibraryImageService, 'prepare'>) {}

  async execute(input: ILibraryUpload): Promise<IMediaLibraryView> {
    const version = await this.library.current(input.siteId, input.expectedVersion);

    validateMediaName(input.filename);
    fileRequirement(Object.values(ImageUploadMode).includes(input.mode), 'Invalid upload mode');
    await this.library.store.checkName(input.siteId, mediaFilenameRoot(input.filename), input.folderId, input.filename);

    const prepared = await this.prepare.prepare(input);
    const file = {
      ...prepared,
      fileId: this.library.values.nextId(),
      name: input.filename,
      folderId: input.folderId,
      mode: prepared.image.mimeType.startsWith('image/') ? input.mode : ImageUploadMode.Original,
      previousPaths: [],
    };

    try {
      const saved = await this.library.store.append(input.siteId, file, this.library.values.nextId(), version);

      return this.library.view(input.siteId, saved);
    } catch (error) {
      return this.library.discardRejected(prepared.image, error);
    }
  }
}
