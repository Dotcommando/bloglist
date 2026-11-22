import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import {
  fileRequirement, folderPath, ImageUploadMode, mediaRoot, validateMediaName,
} from '../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ILibraryUpload } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';
import type { PrepareLibraryImageService } from '../../services/media/prepare-library-image.service.js';

export class UploadMediaFileUseCase {
  constructor(private readonly library: FileLibraryService,
    private readonly prepare: Pick<PrepareLibraryImageService, 'prepare'>) {}

  async execute(input: ILibraryUpload): Promise<IMediaLibraryView> {
    const previous = await this.library.read(input);

    validateMediaName(input.filename);
    fileRequirement(Object.values(ImageUploadMode).includes(input.mode), 'Invalid upload mode');
    folderPath(previous, input.folderId);

    const prepared = await this.prepare.prepare(input);

    if (
      previous.files.some((file) => mediaRoot(file) === mediaRoot(prepared) && file.folderId === input.folderId
      && file.name.normalize('NFC').toLowerCase() === input.filename.normalize('NFC').toLowerCase())
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Image name is already in use');
    }

    const file = {
      ...prepared,
      fileId: this.library.values.nextId(),
      name: input.filename,
      folderId: input.folderId,
      mode: prepared.image.mimeType.startsWith('image/') ? input.mode : ImageUploadMode.Original,
      previousPaths: [],
    };

    return this.library.save(previous, { ...previous, files: [...previous.files, file] });
  }
}
