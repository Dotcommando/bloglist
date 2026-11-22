import { type IMediaFile, type IMediaLibrary } from '../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ILibraryChange, ILibraryScope } from '../../../ports/inbound/media/file-library.port.js';
import type { IMediaLibraryAccess, IMediaLibraryStore } from '../../../ports/outbound/media/file-library.port.js';

/** Shared authorized, version-checked catalog reads for editing and deployment export. */
export class MediaLibraryReaderService {
  constructor(readonly store: IMediaLibraryStore, readonly access: IMediaLibraryAccess) {}

  async read(input: ILibraryScope & Partial<ILibraryChange>): Promise<IMediaLibrary> {
    await this.access.requireEditor(input.siteId);
    const { library, pending } = await this.store.read(input.siteId);

    if (pending || input.expectedVersion !== undefined && input.expectedVersion !== library.version) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Reload the file library');
    }

    return library;
  }

  file(library: IMediaLibrary, fileId: string): IMediaFile {
    const file = library.files.find((file) => file.fileId === fileId);

    if (!file) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Image not found');
    }

    return file;
  }
}
