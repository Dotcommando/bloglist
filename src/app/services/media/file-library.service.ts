import type { IAssetState } from '../../../domain/media/asset.js';
import {
  type IMediaFile, type IMediaLibraryView, libraryView, mediaFileRevision, mediaPath, mediaRoot,
} from '../../../domain/media/file-library.js';
import type { IMediaLocatedFile } from '../../../domain/media/media-browser.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IMediaLibraryAccess, IMediaLibraryStore, IMediaLibraryValues, IMediaUsages,
} from '../../../ports/outbound/media/file-library.port.js';
import { MediaLibraryReaderService } from './media-library-reader.service.js';

export async function discardRejectedMedia(store: IMediaLibraryStore, image: IAssetState, error: unknown):
Promise<never> {
  if (
    error instanceof BusinessError
    && [
      BusinessErrorCode.Conflict, BusinessErrorCode.StaleWrite, BusinessErrorCode.NotFound,
      BusinessErrorCode.Validation,
    ].includes(error.code)
  ) {
    await store.discard(image);
  }
  throw error;
}

/** Shared catalog authorization, concurrency and public-view projection for file operations. */
export class FileLibraryService extends MediaLibraryReaderService {
  constructor(store: IMediaLibraryStore, access: IMediaLibraryAccess,
    readonly values: IMediaLibraryValues, readonly usages: IMediaUsages,
    readonly now: () => Date = () => new Date()) {
    super(store, access);
  }

  async current(siteId: string, expectedVersion?: string): Promise<string> {
    await this.access.requireEditor(siteId);
    const { version, pending } = await this.store.status(siteId);

    if (pending || expectedVersion !== undefined && version !== expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Reload the file library');
    }

    return version;
  }

  async entry(siteId: string, fileId: string, expectedVersion?: string,
    expectedFileVersion?: string): Promise<IMediaLocatedFile> {
    const version = expectedFileVersion === undefined ? await this.current(siteId, expectedVersion) : null;

    if (version === null) {
      await this.access.requireEditor(siteId);
    }

    const located = await this.store.locate(siteId, fileId);

    if (!located) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Image not found');
    }
    if (
      expectedFileVersion === undefined ? located.version !== version
        : mediaFileRevision(located.file) !== expectedFileVersion
    ) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Reload the file library');
    }

    return expectedFileVersion === undefined ? located : { ...located, guardFile: true };
  }

  view(siteId: string, entry: IMediaLocatedFile): IMediaLibraryView {
    const { version, file, ancestry } = entry;

    return libraryView({ siteId, version, folders: ancestry, files: [file] }, this.values.publicPath, false);
  }

  async saveFile(siteId: string, before: IMediaLocatedFile, next: IMediaFile | null, force = false):
  Promise<IMediaLibraryView> {
    const version = this.values.nextId();
    const file = next && {
      ...next,
      createdAt: before.file.createdAt ?? before.file.image.createdAt,
      updatedAt: this.now(),
      revision: version,
    };
    const saved = await this.store.changeFile(siteId, before, file, version, force);

    return saved ? this.view(siteId, saved) : { version, files: [], folders: [], pending: false };
  }

  discardRejected(image: IAssetState, error: unknown): Promise<never> {
    return discardRejectedMedia(this.store, image, error);
  }

  paths({ file, ancestry }: IMediaLocatedFile): string[] {
    const base = this.values.publicPath + '/' + mediaRoot(file) + '/';

    return [...new Set([...file.previousPaths, ...file.outputs.map((output) =>
      base + mediaPath({ folders: ancestry }, file, output.suffix).split('/').map(encodeURIComponent).join('/'))])];
  }
}
