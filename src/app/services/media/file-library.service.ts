import {
  fileRequirement, type IMediaFile, type IMediaLibrary, libraryView, mediaPath, mediaRoot, validateLibrary,
} from '../../../domain/media/file-library.js';
import type {
  IMediaLibraryAccess, IMediaLibraryStore, IMediaLibraryValues, IMediaUsages,
} from '../../../ports/outbound/media/file-library.port.js';
import { MediaLibraryReaderService } from './media-library-reader.service.js';

/** Shared catalog authorization, concurrency and public-view projection for file operations. */
export class FileLibraryService extends MediaLibraryReaderService {
  constructor(store: IMediaLibraryStore, access: IMediaLibraryAccess,
    readonly values: IMediaLibraryValues, readonly usages: IMediaUsages) {
    super(store, access);
  }

  async save(previous: IMediaLibrary, next: IMediaLibrary): Promise<ReturnType<typeof libraryView>> {
    fileRequirement(next.siteId === previous.siteId, 'Foreign library');
    validateLibrary(next);
    const versioned = { ...next, version: this.values.nextId() };

    await this.store.commit(versioned, previous.version);

    return libraryView(versioned, this.values.publicPath, false);
  }

  paths(library: IMediaLibrary, file: IMediaFile): string[] {
    const base = this.values.publicPath + '/' + mediaRoot(file) + '/';

    return [...new Set([...file.previousPaths, ...file.outputs.map((output) =>
      base + mediaPath(library, file, output.suffix).split('/').map(encodeURIComponent).join('/'))])];
  }
}
